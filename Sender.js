/**
 * Sender Class - RDT Stop-and-Wait Client
 * 
 * Implements the sender side of Stop-and-Wait protocol.
 * Sends file chunks with automatic retransmission on timeout.
 * 
 * Protocol Flow:
 * 1. Read file chunk
 * 2. Send packet with sequence number
 * 3. Wait for ACK with timeout
 * 4. If timeout/bad ACK -> retransmit (up to 5 times)
 * 5. If valid ACK -> toggle sequence number and continue
 * 
 * @author Zshah2
 * @version 1.0
 */

const dgram = require('dgram');
const fs = require('fs');

// Import Packet and Pipe classes (see Packet.js and Pipe.js)
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
 * Sender Implementation
 */
class Sender {
    /**
     * Constructor
     * 
     * @param {string} serverAddress - Server hostname/IP
     * @param {number} serverPort - Server port (default: 5555)
     * @param {number} clientPort - Local client port (default: 5556)
     * @param {string} filename - File to send (default: test.txt)
     * @param {number} windowSize - Window size for future use (default: 1)
     * @param {number} lossRate - Network loss rate (0-1)
     * @param {number} corruptionRate - Network corruption rate (0-1)
     * @param {number} delay - Network delay in ms
     */
    constructor(serverAddress, serverPort, clientPort, filename, windowSize,
                lossRate = 0, corruptionRate = 0, delay = 0) {
        this.serverAddress = serverAddress;
        this.serverPort = serverPort;
        this.clientPort = clientPort;
        this.filename = filename;
        this.windowSize = windowSize;
        this.pipe = new Pipe(lossRate, corruptionRate, delay);

        // Protocol state
        this.currentSeqno = 0;
        this.timeout = 2000;  // 2-second timeout
        this.maxRetries = 5;  // Maximum retransmission attempts

        // Statistics
        this.packetsSent = 0;
        this.acksReceived = 0;
        this.retransmissions = 0;
        this.timeouts = 0;

        // UDP socket
        this.socket = dgram.createSocket('udp4');
    }

    /**
     * Initialize sender and print configuration
     */
    start() {
        console.log(`[CLIENT] Started on port ${this.clientPort}`);
        console.log(`[CLIENT] Target: ${this.serverAddress}:${this.serverPort}`);
        console.log(`[CLIENT] File: ${this.filename}`);
        console.log(`[PIPE] ${this.pipe.toString()}`);
        console.log('');
    }

    /**
     * Main send file function
     * Implements Stop-and-Wait protocol
     * 
     * @async
     */
    async sendFile() {
        try {
            // Validate file exists
            if (!fs.existsSync(this.filename)) {
                console.error(`[ERROR] File not found: ${this.filename}`);
                return;
            }

            const fileData = fs.readFileSync(this.filename);
            let offset = 0;

            // Process file in chunks
            while (offset < fileData.length) {
                const chunkSize = Math.min(Packet.MAX_DATA_SIZE, fileData.length - offset);
                const chunk = fileData.slice(offset, offset + chunkSize);
                offset += chunkSize;

                // Send packet with Stop-and-Wait protocol
                let ackReceived = false;
                let attempts = 0;

                while (!ackReceived && attempts < this.maxRetries) {
                    try {
                        // Create packet with current sequence number
                        const dataPacket = new Packet(this.currentSeqno, chunk);
                        const packetBytes = dataPacket.toByteArray();

                        // Send packet
                        await this.sendPacket(packetBytes);

                        if (attempts > 0) {
                            this.retransmissions++;
                            console.log(`[CLIENT] RETRANSMISSION #${attempts} - Seq: ${this.currentSeqno}, Size: ${chunkSize} bytes`);
                        } else {
                            console.log(`[CLIENT] Sent packet - Seq: ${this.currentSeqno}, Size: ${chunkSize} bytes`);
                        }

                        // Wait for ACK
                        const ackData = await this.receiveACK();

                        if (ackData) {
                            // Parse ACK packet
                            const ackPacket = Packet.fromByteArray(ackData);

                            // Validate ACK
                            if (this.pipe.isPacketValid(ackPacket) && ackPacket.seqno === this.currentSeqno) {
                                console.log(`[CLIENT] ACK received for seq: ${this.currentSeqno}`);
                                this.acksReceived++;
                                ackReceived = true;
                                this.currentSeqno = 1 - this.currentSeqno;  // Toggle: 0 -> 1, 1 -> 0
                            } else {
                                console.log(`[CLIENT] Invalid ACK or wrong seq number`);
                                attempts++;
                            }
                        } else {
                            console.log(`[CLIENT] TIMEOUT waiting for ACK`);
                            this.timeouts++;
                            attempts++;
                        }

                    } catch (e) {
                        console.error(`[ERROR] ${e.message}`);
                        attempts++;
                    }
                }

                if (!ackReceived) {
                    console.error(`[ERROR] Failed to send packet after ${this.maxRetries} attempts`);
                    break;
                }
            }

            // Print final statistics
            this.printStatistics();
            this.socket.close();

        } catch (e) {
            console.error(`[ERROR] ${e.message}`);
        }
    }

    /**
     * Send packet through network
     * 
     * @private
     * @async
     * @param {Uint8Array} packetBytes - Packet data to send
     * @returns {Promise<void>}
     */
    sendPacket(packetBytes) {
        return new Promise((resolve, reject) => {
            this.socket.send(packetBytes, 0, packetBytes.length, this.serverPort,
                           this.serverAddress, (err) => {
                if (err) reject(err);
                else {
                    this.packetsSent++;
                    resolve();
                }
            });
        });
    }

    /**
     * Wait for ACK from receiver with timeout
     * 
     * @private
     * @async
     * @returns {Promise<Uint8Array|null>} ACK data or null on timeout
     */
    receiveACK() {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                resolve(null);  // Timeout
            }, this.timeout);

            const messageHandler = (msg, rinfo) => {
                clearTimeout(timeoutId);
                this.socket.off('message', messageHandler);
                resolve(msg);
            };

            this.socket.on('message', messageHandler);
        });
    }

    /**
     * Print transfer statistics
     */
    printStatistics() {
        const successRate = this.acksReceived > 0 ? ((this.acksReceived / (this.acksReceived + this.retransmissions)) * 100).toFixed(1) : 0;
        
        console.log('\n========== SENDER STATISTICS ==========');
        console.log(`Packets Sent:      ${this.packetsSent}`);
        console.log(`ACKs Received:     ${this.acksReceived}`);
        console.log(`Retransmissions:   ${this.retransmissions}`);
        console.log(`Timeouts:          ${this.timeouts}`);
        console.log(`Success Rate:      ${successRate}%`);
        console.log('========================================');
    }
}

// Main execution
if (require.main === module) {
    const sender = new Sender('localhost', 5555, 5556, 'test.txt', 1, 0, 0, 0);
    sender.start();
    sender.sendFile().catch(e => console.error(e));
}

module.exports = Sender;
