/**
 * Pipe Class - Network Simulator
 * 
 * Simulates real-world network conditions:
 * - Packet loss (random drops)
 * - Packet corruption (bit errors)
 * - Transmission delay (latency)
 * 
 * Used to test RDT protocol reliability in various scenarios.
 * 
 * @author Zshah2
 * @version 1.0
 */

class Pipe {
    /**
     * Constructor - Initialize network simulator with conditions
     * 
     * @param {number} lossRate - Probability of packet loss (0.0 to 1.0)
     * @param {number} corruptionRate - Probability of corruption (0.0 to 1.0)
     * @param {number} delay - Transmission delay in milliseconds
     * 
     * @throws {Error} If parameters are out of valid range
     */
    constructor(lossRate = 0.0, corruptionRate = 0.0, delay = 0) {
        // Validate and clamp input parameters
        this.lossRate = this._validateRate(lossRate, 'Loss rate');
        this.corruptionRate = this._validateRate(corruptionRate, 'Corruption rate');
        this.delay = this._validateDelay(delay);
    }

    /**
     * Validate probability rate is between 0 and 1
     * 
     * @private
     * @param {number} rate - Rate to validate
     * @param {string} name - Parameter name for error messages
     * @returns {number} Clamped rate (0.0 to 1.0)
     */
    _validateRate(rate, name) {
        if (typeof rate !== 'number' || rate < 0 || rate > 1) {
            console.warn(`${name} out of range, clamping to [0, 1]`);
        }
        return Math.max(0, Math.min(1, rate));
    }

    /**
     * Validate delay is non-negative
     * 
     * @private
     * @param {number} delay - Delay in milliseconds
     * @returns {number} Non-negative delay
     */
    _validateDelay(delay) {
        if (typeof delay !== 'number' || delay < 0) {
            console.warn('Delay must be non-negative');
        }
        return Math.max(0, delay);
    }

    /**
     * Simulate sending packet through network
     * Applies loss, corruption, and delay realistically
     * 
     * @async
     * @param {Packet} packet - Packet to transmit
     * @returns {Promise<Packet|null>} Packet if successful, null if lost
     */
    async send(packet) {
        // Simulate transmission delay (latency)
        if (this.delay > 0) {
            await this.sleep(this.delay);
        }

        // Simulate packet loss
        if (Math.random() < this.lossRate) {
            console.log(`[PIPE] Packet ${packet.seqno} LOST`);
            return null;
        }

        // Simulate bit corruption
        if (Math.random() < this.corruptionRate) {
            console.log(`[PIPE] Packet ${packet.seqno} CORRUPTED`);
            // Corrupt the checksum to simulate bit flip
            packet.cksum = Math.floor(Math.random() * 256);
            return packet;
        }

        // Packet successfully transmitted
        return packet;
    }

    /**
     * Validate packet integrity
     * Checks if packet passed through network uncorrupted
     * 
     * @param {Packet} packet - Packet to validate
     * @returns {boolean} True if packet is valid, false if corrupted
     */
    isPacketValid(packet) {
        if (packet === null) {
            return false;
        }
        return packet.verifyChecksum();
    }

    /**
     * Sleep helper for async delay simulation
     * 
     * @private
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get current network condition statistics
     * 
     * @returns {Object} Configuration object
     */
    getConfig() {
        return {
            lossRate: this.lossRate,
            corruptionRate: this.corruptionRate,
            delay: this.delay
        };
    }

    /**
     * Update network conditions dynamically
     * 
     * @param {Object} config - Configuration object with lossRate, corruptionRate, delay
     */
    updateConfig(config) {
        if (config.lossRate !== undefined) this.lossRate = this._validateRate(config.lossRate, 'Loss rate');
        if (config.corruptionRate !== undefined) this.corruptionRate = this._validateRate(config.corruptionRate, 'Corruption rate');
        if (config.delay !== undefined) this.delay = this._validateDelay(config.delay);
    }

    /**
     * String representation of network conditions
     * 
     * @returns {string} Human-readable network statistics
     */
    toString() {
        return `Pipe [loss=${(this.lossRate * 100).toFixed(1)}%, corruption=${(this.corruptionRate * 100).toFixed(1)}%, delay=${this.delay}ms]`;
    }
}
