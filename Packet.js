/**
 * Packet Class - RDT Stop-and-Wait Protocol
 * 
 * Represents a data or ACK packet with header information and payload.
 * Includes checksum calculation for error detection.
 * 
 * @author Zshah2
 * @version 1.0
 */

class Packet {
    // Static constants for packet structure
    static HEADER_SIZE = 8;           // 2 + 2 + 4 bytes
    static MAX_DATA_SIZE = 500;       // Maximum payload size
    static MAX_PACKET_SIZE = Packet.HEADER_SIZE + Packet.MAX_DATA_SIZE;
    static ACK_PACKET_SIZE = Packet.HEADER_SIZE;

    /**
     * Constructor - Creates either a data packet or ACK packet
     * 
     * @param {number} seqnoOrAckno - Sequence number (data) or ACK number
     * @param {Uint8Array|null} data - Payload data (null for ACK packets)
     * 
     * @throws {Error} If sequence number is invalid
     */
    constructor(seqnoOrAckno, data = null) {
        if (!Number.isInteger(seqnoOrAckno) || seqnoOrAckno < 0) {
            throw new Error('Invalid sequence number');
        }

        this.seqno = seqnoOrAckno;
        this.data = data !== null ? data : null;
        this.len = data !== null ? (Packet.HEADER_SIZE + data.length) : Packet.HEADER_SIZE;
        this.cksum = this.calculateChecksum();
    }

    /**
     * Calculate checksum using sum modulo 256 algorithm
     * Simple but effective for detecting single and multiple bit errors
     * 
     * @private
     * @returns {number} Checksum value (0-255)
     */
    calculateChecksum() {
        let sum = 0;

        // Add sequence number bytes (4 bytes, little-endian)
        sum += (this.seqno & 0xFF);
        sum += ((this.seqno >> 8) & 0xFF);
        sum += ((this.seqno >> 16) & 0xFF);
        sum += ((this.seqno >> 24) & 0xFF);

        // Add payload bytes if present
        if (this.data !== null && this.data.length > 0) {
            for (let byte of this.data) {
                sum += (byte & 0xFF);
            }
        }

        // Return modulo 256 to fit in 2 bytes
        return sum % 256;
    }

    /**
     * Verify packet integrity by checking checksum
     * 
     * @returns {boolean} True if checksum is valid, false otherwise
     */
    verifyChecksum() {
        return this.cksum === this.calculateChecksum();
    }

    /**
     * Convert packet to byte array for transmission
     * Format: [cksum:2][len:2][seqno:4][data:variable]
     * 
     * @returns {Uint8Array} Binary packet data
     */
    toByteArray() {
        const buffer = new ArrayBuffer(this.len);
        const view = new DataView(buffer);

        // Write header (8 bytes)
        view.setInt16(0, this.cksum, false);  // Checksum
        view.setInt16(2, this.len, false);    // Length
        view.setInt32(4, this.seqno, false);  // Sequence number

        // Write payload data if present
        if (this.data !== null && this.data.length > 0) {
            for (let i = 0; i < this.data.length; i++) {
                view.setUint8(Packet.HEADER_SIZE + i, this.data[i]);
            }
        }

        return new Uint8Array(buffer);
    }

    /**
     * Reconstruct packet from byte array
     * Static factory method for deserialization
     * 
     * @static
     * @param {Uint8Array} bytes - Binary packet data
     * @returns {Packet} Reconstructed packet object
     * @throws {Error} If packet data is corrupted
     */
    static fromByteArray(bytes) {
        if (bytes.length < Packet.HEADER_SIZE) {
            throw new Error('Packet too small');
        }

        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        // Read header
        const packet = new Packet(0);
        packet.cksum = view.getInt16(0, false);
        packet.len = view.getInt16(2, false);
        packet.seqno = view.getInt32(4, false);

        // Read payload if present
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
     * Check if this is an ACK packet (no payload)
     * 
     * @returns {boolean} True if ACK packet, false if data packet
     */
    isAckPacket() {
        return this.data === null || this.data.length === 0;
    }

    /**
     * Check if this is a data packet (has payload)
     * 
     * @returns {boolean} True if data packet, false if ACK
     */
    isDataPacket() {
        return !this.isAckPacket();
    }

    /**
     * Get packet size in bytes
     * 
     * @returns {number} Total packet size including header
     */
    getSize() {
        return this.len;
    }

    /**
     * Get payload size in bytes
     * 
     * @returns {number} Payload size (0 for ACK packets)
     */
    getPayloadSize() {
        return this.data ? this.data.length : 0;
    }

    /**
     * String representation for logging and debugging
     * 
     * @returns {string} Human-readable packet description
     */
    toString() {
        if (this.isAckPacket()) {
            return `ACK [seq=${this.seqno}, cksum=${this.cksum}]`;
        } else {
            return `DATA [seq=${this.seqno}, len=${this.len}, size=${this.data.length}, cksum=${this.cksum}]`;
        }
    }
}
