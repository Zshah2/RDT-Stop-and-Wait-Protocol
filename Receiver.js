/**
 * Receiver Class - RDT Stop-and-Wait Server
 * 
 * Implements the receiver side of Stop-and-Wait protocol.
 * Validates packets, writes data to file, and sends ACKs.
 * 
 * Protocol Flow:
 * 1. Listen on UDP port for incoming packets
 * 2. Validate packet checksum
 * 3. If valid and correct sequence -> write data and send ACK
 * 4. If invalid or wrong sequence -> send NAK or resend last ACK
 * 5. Continue until all data received
 * 
 * @author Zshah2
 * @version 1.0
 */

const dgram = require('dgram');
const fs = require('fs');

// Packet class definition
class Packet {
    static HEADER_SIZE = 8;
    static MAX_DATA_SIZE = 500;
    static MAX_PACKET_SIZE = Packet.HEADER_SIZE + Packet.MAX_DATA_SIZE;
    static ACK_PACKET_SIZE = Packet.HEADER_SIZE;

    constructor(seqnoOrAckno, data = null) {
        if (!Number.isInteger(seqnoOrAckno) || seqnoOrAckno < 0) {
            throw new Error('Invalid sequence number');
        }
        this.seqno = seqnoOrAckno;
        this.data = data !== null ? data : null;
        this.len = data !== null ? (Packet.HEADER_SIZE + data.length) : Packet.HEADER_SIZE;
        this.cksum = this.calculateChecksum();
    }

    calculateChecksum() {
        let sum = 0;
        sum += (this.seqno & 0xFF);
        sum += ((this.seqno >> 8) & 0xFF);
        sum += ((this.seqno >> 16) & 0xFF);
        sum += ((this.seqno >> 24) & 0xFF);
        if (this.data !== null) {
            for (let byte of this.data) {
                sum += (byte & 0xFF);
            }
        }
        return sum % 256;
    }

    verifyChecksum() {
        return this.cksum === this.calculateChecksum();
    }

    toByteArray() {
        const buffer = new ArrayBuffer(this.len);
        const view = new DataView(buffer);
        view.setInt16(0, this.cksum, false);
        view.setInt16(2, this.len, false);
        view.setInt32(4, this.seqno, false);
        if (this.data !== null && this.data.length > 0) {
            for (let i = 0; i < this.data.length; i++) {
                view.setUint8(Packet.HEADER_SIZE + i, this.data[i]);
            }
        }
        return new Uint8Array(buffer);
    }

    static fromByteArray(bytes) {
        if (bytes.length < Packet.HEADER_SIZE) {
            throw new Error('Packet too small');
        }
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const packet = new Packet(0);
        packet.cksum = view.getInt16(0, false);
        packet.len = view.getInt16(2, false);
        packet.seqno = view.getInt32(4, false);
        const dataLength = packet.len - Packet.HEADER_SIZE;
        if (dataLength > 0) {
            packet.data = new Uint8Array(dataLength);
            for (let i = 0; i < dataLength; i++) {
                packet.data[i] = view.getUint8(Packet.HEADER_SIZE + i);
            }
        }
        return packet;
    }

    isAckPacket() {
        return this.data === null || this.data.length === 0;
    }

    isDataPacket() {
        return !this.isAckPacket();
    }

    toString() {
        if (this.isAckPacket()) {
            return `ACK [seq=${this.seqno}, cksum=${this.cksum}]`;
        } else {
            return `DATA [seq=${this.seqno}, len=${this.len}, size=${this.data.length}, cksum=${this.cksum}]`;
        }
    }
}

// Pipe class definition
class Pipe {
    constructor(lossRate = 0.0, corruptionRate = 0.0, delay = 0) {
        this.lossRate = Math.max(0, Math.min(1, lossRate));
        this.corruptionRate = Math.max(0, Math.min(1, corruptionRate));
        this.delay = Math.max(0, delay);
    }

    async send(packet) {
        if (this.delay > 0) {
            await this.sleep(this.delay);
        }
        if (Math.random() < this.lossRate) {
            console.log(`[PIPE] Packet ${packet.seqno} LOST`);
            return null;
        }
        if (Math.random() < this.corruptionRate) {
            console.log(`[PIPE] Packet ${packet.seqno} CORRUPTED`);
            packet.cksum = Math.floor(Math.random() * 256);
            return packet;
        }
        return packet;
    }

    isPacketValid(packet) {
        if (packet === null) return false;
        return packet.verifyChecksum();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    toString() {
        return `Pipe [loss=${(this.lossRate * 100).toFixed(1)}%, corruption=${(this.corruptionRate * 100).toFixed(1)}%, delay=${this.delay}ms]`;
    }
}

/**
 * Receiver Implementation
 */
class Receiver {
    /**
     * Constructor
     * 
     * @param {number} port - UDP port to listen on (default: 5555)
     * @param {number} windowSize - Window size for future use (default: 1)
     * @param {number} lossRate - Network loss rate (0-1)
     * @param {number} corruptionRate - Network corruption rate (0-1)
     * @param {number} delay - Network delay in ms
     */
    constructor(port, windowSize, lossRate = 0, corruptionRate = 0, delay = 0) {
        this.port = port;
        this.windowSize = windowSize;
        this.pipe = new Pipe(lossRate, corruptionRate, delay);
        this.outputFilename = 'received_file.txt';

        // Protocol state
        this.expectedSeqno = 0;
        this.fileOutput = null;

        // Statistics
        this.packetsReceived = 0;
        this.acksSent = 0;
        this.packetsCorrupted = 0;
        this.outOfOrderPackets = 0;
        this.bytesReceived = 0;

        // UDP socket
        this.socket = dgram.createSocket('udp4');
        this.done = false;
    }

    /**
     * Initialize receiver and start listening
     */
    start() {
        console.log(`[SERVER] Listening on port ${this.port}`);
        console.log(`[SERVER] Window size: ${this.windowSize}`);
        console.log(`[PIPE] ${this.pipe.toString()}`);
        console.log('');

        // Create output file stream
        this.fileOutput = fs.createWriteStream(this.outputFilename);

        // Register message handler
        this.socket.on('message', (msg, rinfo) => {
            this.handlePacket(msg, rinfo);
        });

        // Error handler
        this.socket.on('error', (err) => {
            console.error(`[ERROR] Socket error: ${err.message}`);
        });

        // Bind to port
        this.socket.bind(this.port);

        // Timeout after 30 seconds of inactivity
        setTimeout(() => {
            if (!this.done) {
                this.done = true;
                this.fileOutput.end();
                this.printStatistics();
                this.socket.close();
            }
        }, 30000);
    }

    /**
     * Handle received packet
     * 
     * @private
     * @param {Buffer} msg - Received message
     * @param {Object} rinfo - Remote info (address, port)
     */
    handlePacket(msg, rinfo) {
        try {
            // Parse packet from bytes
            const packet = Packet.fromByteArray(msg);

            this.packetsReceived++;
            console.log(`\n[SERVER] Received: ${packet.toString()}`);
            console.log(`[SERVER] Expected: seq=${this.expectedSeqno}`);

            // Validate checksum
            if (!this.pipe.isPacketValid(packet)) {
                this.packetsCorrupted++;
                console.log(`[SERVER] ✗ Checksum FAILED - Sending NAK`);
                this.sendACK(rinfo.address, rinfo.port, this.expectedSeqno, false);
                return;
            }

            // Check sequence number
            if (packet.seqno === this.expectedSeqno) {
                // Correct packet - write data and send ACK
                if (packet.isDataPacket()) {
                    this.fileOutput.write(Buffer.from(packet.data));
                    this.bytesReceived += packet.data.length;
                    console.log(`[SERVER] ✓ Data written (${packet.data.length} bytes)`);
                }

                // Send ACK
                this.sendACK(rinfo.address, rinfo.port, this.expectedSeqno, true);
                this.acksSent++;

                // Toggle sequence number
                this.expectedSeqno = 1 - this.expectedSeqno;

                // Check if last packet (incomplete chunk)
                if (packet.isDataPacket() && packet.data.length < Packet.MAX_DATA_SIZE) {
                    console.log(`[SERVER] Last packet received (${packet.data.length} < ${Packet.MAX_DATA_SIZE})`);
                    this.done = true;
                    setTimeout(() => {
                        this.fileOutput.end();
                        this.printStatistics();
                        this.socket.close();
                    }, 100);
                }
            } else {
                // Out of order packet
                this.outOfOrderPackets++;
                console.log(`[SERVER] ✗ Out of order - Resending last ACK`);
                this.sendACK(rinfo.address, rinfo.port, 1 - this.expectedSeqno, true);
            }

        } catch (e) {
            console.error(`[ERROR] Packet parsing failed: ${e.message}`);
        }
    }

    /**
     * Send ACK back to sender
     * 
     * @private
     * @param {string} address - Destination IP
     * @param {number} port - Destination port
     * @param {number} ackno - ACK sequence number
     * @param {boolean} valid - True for ACK, false for NAK
     */
    sendACK(address, port, ackno, valid) {
        try {
            const ackPacket = new Packet(ackno);
            const packetBytes = ackPacket.toByteArray();

            this.socket.send(packetBytes, 0, packetBytes.length, port, address, (err) => {
                if (err) {
                    console.error(`[ERROR] Failed to send ACK: ${err.message}`);
                } else {
                    const status = valid ? '✓' : '✗';
                    console.log(`[SERVER] ${status} Sent ACK: seq=${ackno}`);
                }
            });
        } catch (e) {
            console.error(`[ERROR] ACK creation failed: ${e.message}`);
        }
    }

    /**
     * Print transfer statistics
     */
    printStatistics() {
        const errorRate = this.packetsReceived > 0 ? ((this.packetsCorrupted / this.packetsReceived) * 100).toFixed(1) : 0;

        console.log('\n========== RECEIVER STATISTICS ==========');
        console.log(`Packets Received:      ${this.packetsReceived}`);
        console.log(`ACKs Sent:             ${this.acksSent}`);
        console.log(`Bytes Received:        ${this.bytesReceived}`);
        console.log(`Corrupted Packets:     ${this.packetsCorrupted}`);
        console.log(`Out of Order Packets:  ${this.outOfOrderPackets}`);
        console.log(`Error Rate:            ${errorRate}%`);
        console.log(`Output File:           ${this.outputFilename}`);
        console.log('=========================================');
    }
}

// Main execution
if (require.main === module) {
    const receiver = new Receiver(5555, 1, 0, 0, 0);
    receiver.start();
}

module.exports = Receiver;
