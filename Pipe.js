/**
 * Pipe class simulates a faulty network connection
 * Can drop packets or introduce corruption/delay
 */
class Pipe {
    /**
     * Constructor with network conditions
     * @param {number} lossRate probability of loss (0.0 to 1.0)
     * @param {number} corruptionRate probability of corruption (0.0 to 1.0)
     * @param {number} delay delay in milliseconds
     */
    constructor(lossRate = 0.0, corruptionRate = 0.0, delay = 0) {
        this.lossRate = Math.max(0, Math.min(1, lossRate));
        this.corruptionRate = Math.max(0, Math.min(1, corruptionRate));
        this.delay = Math.max(0, delay);
    }

    /**
     * Simulate sending a packet through the pipe
     * @param {Packet} packet the packet to send
     * @returns {Packet|null} the packet if it makes it through, null if lost
     */
    async send(packet) {
        // Simulate delay
        if (this.delay > 0) {
            await this.sleep(this.delay);
        }

        // Simulate packet loss
        if (Math.random() < this.lossRate) {
            console.log(`[PIPE] Packet ${packet.seqno} LOST`);
            return null;
        }

        // Simulate corruption
        if (Math.random() < this.corruptionRate) {
            console.log(`[PIPE] Packet ${packet.seqno} CORRUPTED`);
            packet.cksum = Math.floor(Math.random() * 256);
            return packet;
        }

        // Packet made it through successfully
        return packet;
    }

    /**
     * Receive a packet (after it's been sent through pipe)
     * @param {Packet} packet the packet received
     * @returns {boolean} true if packet is valid (not corrupted)
     */
    isPacketValid(packet) {
        if (packet === null) {
            return false;
        }
        return packet.verifyChecksum();
    }

    /**
     * Helper to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Getters and setters
    getLossRate() {
        return this.lossRate;
    }

    setLossRate(lossRate) {
        this.lossRate = Math.max(0, Math.min(1, lossRate));
    }

    getCorruptionRate() {
        return this.corruptionRate;
    }

    setCorruptionRate(corruptionRate) {
        this.corruptionRate = Math.max(0, Math.min(1, corruptionRate));
    }

    getDelay() {
        return this.delay;
    }

    setDelay(delay) {
        this.delay = Math.max(0, delay);
    }

    toString() {
        return `Pipe [loss=${(this.lossRate * 100).toFixed(2)}%, corruption=${(this.corruptionRate * 100).toFixed(2)}%, delay=${this.delay}ms]`;
    }
}