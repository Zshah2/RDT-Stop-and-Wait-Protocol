/**
 * Sender - Client that sends file to Receiver
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

// Sender Class
class Sender {
    constructor(serverAddress, serverPort, clientPort, filename, windowSize,
                lossRate = 0, corruptionRate = 0, delay = 0) {
        this.serverAddress = serverAddress;
        this.serverPort = serverPort;
        this.clientPort = clientPort;
        this.filename = filename;
        this.windowSize = windowSize;
        this.pipe = new Pipe(lossRate, corruptionRate, delay);

        this.currentSeqno = 0;
        this.timeout = 2000;

        this.packetsSent = 0;
        this.acksReceived = 0;
        this.retransmissions = 0;
        this.timeouts = 0;

        this.socket = dgram.createSocket('udp4');
    }

    start() {
        console.log(`[CLIENT] Started on port ${this.clientPort}`);
        console.log(`[CLIENT] Sending to ${this.serverAddress}:${this.serverPort}`);
        console.log(`[CLIENT] File: ${this.filename}`);
        console.log(`[PIPE] ${this.pipe.toString()}`);
    }

    async sendFile() {
        try {
            if (!fs.existsSync(this.filename)) {
                console.log(`[ERROR] File not found: ${this.filename}`);
                return;
            }

            const fileData = fs.readFileSync(this.filename);
            let offset = 0;

            while (offset < fileData.length) {
                const chunkSize = Math.min(Packet.MAX_DATA_SIZE, fileData.length - offset);
                const chunk = fileData.slice(offset, offset + chunkSize);
                offset += chunkSize;

                let ackReceived = false;
                let attempts = 0;

                while (!ackReceived && attempts < 5) {
                    try {
                        const dataPacket = new Packet(this.currentSeqno, chunk);
                        const packetBytes = dataPacket.toByteArray();

                        await this.sendPacket(packetBytes);

                        if (attempts > 0) {
                            this.retransmissions++;
                            console.log(`[CLIENT] RETRANSMISSION #${attempts} - Seq: ${this.currentSeqno}, Size: ${chunkSize}`);
                        } else {
                            console.log(`[CLIENT] Sent packet - Seq: ${this.currentSeqno}, Size: ${chunkSize}`);
                        }

                        const ackData = await this.receiveACK();

                        if (ackData) {
                            const ackPacket = Packet.fromByteArray(ackData);

                            if (this.pipe.isPacketValid(ackPacket) && ackPacket.seqno === this.currentSeqno) {
                                console.log(`[CLIENT] ACK received for seq: ${this.currentSeqno}`);
                                this.acksReceived++;
                                ackReceived = true;
                                this.currentSeqno = 1 - this.currentSeqno;
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
                        console.log(`[ERROR] ${e.message}`);
                        attempts++;
                    }
                }

                if (!ackReceived) {
                    console.log(`[ERROR] Failed to send packet after 5 attempts`);
                    break;
                }
            }

            this.printStatistics();
            this.socket.close();

        } catch (e) {
            console.log(`[ERROR] ${e.message}`);
        }
    }

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

    receiveACK() {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                resolve(null);
            }, this.timeout);

            const messageHandler = (msg, rinfo) => {
                clearTimeout(timeoutId);
                this.socket.off('message', messageHandler);
                resolve(msg);
            };

            this.socket.on('message', messageHandler);
        });
    }

    printStatistics() {
        console.log('\n========== SENDER STATISTICS ==========');
        console.log(`Packets Sent: ${this.packetsSent}`);
        console.log(`ACKs Received: ${this.acksReceived}`);
        console.log(`Retransmissions: ${this.retransmissions}`);
        console.log(`Timeouts: ${this.timeouts}`);
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