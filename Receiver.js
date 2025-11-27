/**
 * Receiver - Server that receives file from Sender
 * Implements Stop-and-Wait RDT protocol
 */

const dgram = require('dgram');
const fs = require('fs');

// Packet Class
class Packet {
    static HEADER_SIZE = 8;
    static MAX_DATA_SIZE = 500;
    static MAX_PACKET_SIZE = Packet.HEADER_SIZE + Packet.MAX_DATA_SIZE;
    static ACK_PACKET_SIZE = Packet.HEADER_SIZE;

    constructor(seqnoOrAckno, data = null) {
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
            return `ACK Packet [seqno=${this.seqno}, cksum=${this.cksum}]`;
        } else {
            return `Data Packet [seqno=${this.seqno}, len=${this.len}, dataSize=${this.data.length}, cksum=${this.cksum}]`;
        }
    }
}

// Pipe Class
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
        if (packet === null) {
            return false;
        }
        return packet.verifyChecksum();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    toString() {
        return `Pipe [loss=${(this.lossRate * 100).toFixed(2)}%, corruption=${(this.corruptionRate * 100).toFixed(2)}%, delay=${this.delay}ms]`;
    }
}

// Receiver Class
class Receiver {
    constructor(port, windowSize, lossRate = 0, corruptionRate = 0, delay = 0) {
        this.port = port;
        this.windowSize = windowSize;
        this.pipe = new Pipe(lossRate, corruptionRate, delay);
        this.outputFilename = 'received_file.txt';

        this.expectedSeqno = 0;
        this.fileOutput = null;

        this.packetsReceived = 0;
        this.acksSent = 0;
        this.packetsCorrupted = 0;
        this.outOfOrderPackets = 0;

        this.socket = dgram.createSocket('udp4');
        this.done = false;
    }

    start() {
        console.log(`[SERVER] Listening on port ${this.port}`);
        console.log(`[SERVER] Window size: ${this.windowSize}`);
        console.log(`[PIPE] ${this.pipe.toString()}`);

        this.fileOutput = fs.createWriteStream(this.outputFilename);

        this.socket.on('message', (msg, rinfo) => {
            this.handlePacket(msg, rinfo);
        });

        this.socket.on('error', (err) => {
            console.log(`[ERROR] ${err.message}`);
        });

        this.socket.bind(this.port);

        setTimeout(() => {
            if (!this.done) {
                this.done = true;
                this.fileOutput.end();
                this.printStatistics();
                this.socket.close();
            }
        }, 30000);
    }

    handlePacket(msg, rinfo) {
        try {
            const packet = Packet.fromByteArray(msg);

            this.packetsReceived++;
            console.log(`\n[SERVER] Received: ${packet.toString()}`);
            console.log(`[SERVER] Expected seq: ${this.expectedSeqno}`);

            if (!this.pipe.isPacketValid(packet)) {
                this.packetsCorrupted++;
                console.log(`[SERVER] Checksum FAILED - Sending NAK`);
                this.sendACK(rinfo.address, rinfo.port, this.expectedSeqno, false);
                return;
            }

            if (packet.seqno === this.expectedSeqno) {
                if (packet.isDataPacket()) {
                    this.fileOutput.write(Buffer.from(packet.data));
                    console.log(`[SERVER] Data written to file`);
                }

                this.sendACK(rinfo.address, rinfo.port, this.expectedSeqno, true);
                this.acksSent++;

                this.expectedSeqno = 1 - this.expectedSeqno;

                if (packet.isDataPacket() && packet.data.length < Packet.MAX_DATA_SIZE) {
                    console.log(`[SERVER] Last packet received (size < max)`);
                    this.done = true;
                    setTimeout(() => {
                        this.fileOutput.end();
                        this.printStatistics();
                        this.socket.close();
                    }, 100);
                }
            } else {
                this.outOfOrderPackets++;
                console.log(`[SERVER] Out of order packet - Resending last ACK`);
                this.sendACK(rinfo.address, rinfo.port, 1 - this.expectedSeqno, true);
            }

        } catch (e) {
            console.log(`[ERROR] ${e.message}`);
        }
    }

    sendACK(address, port, ackno, valid) {
        try {
            const ackPacket = new Packet(ackno);
            const packetBytes = ackPacket.toByteArray();

            this.socket.send(packetBytes, 0, packetBytes.length, port, address, (err) => {
                if (err) {
                    console.log(`[ERROR] ${err.message}`);
                } else {
                    console.log(`[SERVER] Sent ACK: seqno=${ackno} ${valid ? '(valid)' : '(NAK)'}`);
                }
            });
        } catch (e) {
            console.log(`[ERROR] ${e.message}`);
        }
    }

    printStatistics() {
        console.log('\n========== RECEIVER STATISTICS ==========');
        console.log(`Packets Received: ${this.packetsReceived}`);
        console.log(`ACKs Sent: ${this.acksSent}`);
        console.log(`Corrupted Packets: ${this.packetsCorrupted}`);
        console.log(`Out of Order Packets: ${this.outOfOrderPackets}`);
        console.log(`File written to: ${this.outputFilename}`);
        console.log('=========================================');
    }
}

// Main execution
if (require.main === module) {
    const receiver = new Receiver(5555, 1, 0, 0, 0);
    receiver.start();
}

module.exports = Receiver;