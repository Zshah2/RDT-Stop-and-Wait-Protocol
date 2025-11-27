/**
 * Packet class for RDT Stop-and-Wait protocol
 * Data packets: 12-512 bytes (header + data)
 * ACK packets: 8 bytes (header only)
 */
class Packet {
    static HEADER_SIZE = 8;
    static MAX_DATA_SIZE = 500;
    static MAX_PACKET_SIZE = Packet.HEADER_SIZE + Packet.MAX_DATA_SIZE;
    static ACK_PACKET_SIZE = Packet.HEADER_SIZE;

    /**
     * Constructor for data packet: new Packet(seqno, data)
     * Constructor for ACK packet: new Packet(ackno)
     */
    constructor(seqnoOrAckno, data = null) {
        this.seqno = seqnoOrAckno;
        this.data = data !== null ? data : null;
        this.len = data !== null ? (Packet.HEADER_SIZE + data.length) : Packet.HEADER_SIZE;
        this.cksum = this.calculateChecksum();
    }

    /**
     * Calculate checksum based on packet data
     * Simple sum of all bytes modulo 256
     */
    calculateChecksum() {
        let sum = 0;

        // Add sequence number bytes
        sum += (this.seqno & 0xFF);
        sum += ((this.seqno >> 8) & 0xFF);
        sum += ((this.seqno >> 16) & 0xFF);
        sum += ((this.seqno >> 24) & 0xFF);

        // Add data bytes if present
        if (this.data !== null) {
            for (let byte of this.data) {
                sum += (byte & 0xFF);
            }
        }

        return sum % 256;
    }

    /**
     * Verify checksum - returns true if valid
     */
    verifyChecksum() {
        return this.cksum === this.calculateChecksum();
    }

    /**
     * Convert packet to byte array for transmission
     */
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

    /**
     * Construct packet from byte array
     */
    static fromByteArray(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        const packet = new Packet(0);
        packet.cksum = view.getInt16(0, false);
        packet.len = view.getInt16(2, false);
        packet.seqno = view.getInt32(4, false);

        // Read data if present
        const dataLength = packet.len - Packet.HEADER_SIZE;
        if (dataLength > 0) {
            packet.data = new Uint8Array(dataLength);
            for (let i = 0; i < dataLength; i++) {
                packet.data[i] = view.getUint8(Packet.HEADER_SIZE + i);
            }
        }

        return packet;
    }

    /**
     * Check if this is an ACK packet (no data)
     */
    isAckPacket() {
        return this.data === null || this.data.length === 0;
    }

    /**
     * Check if this is a data packet
     */
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