// Global state
const state = {
    packetsSent: 0,
    acksReceived: 0,
    retransmissions: 0,
    packetsLost: 0,
    isWaiting: false,
    currentPacket: null,
    animationInProgress: false,
    autoSendActive: false,
    autoSendTimer: null
};

// Convert packet size based on unit
function convertPacketSize() {
    const size = parseFloat(document.getElementById('packetSize').value);
    const unit = document.getElementById('packetSizeUnit').value;

    switch(unit) {
        case 'bytes':
            return size;
        case 'kb':
            return size * 1024;
        case 'mb':
            return size * 1024 * 1024;
        case 'gb':
            return size * 1024 * 1024 * 1024;
        default:
            return size;
    }
}

// Format bytes to readable size
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Toggle auto-send mode
function toggleAutoSend() {
    const packetLimit = parseInt(document.getElementById('packetLimit').value);
    const autoSendBtn = document.getElementById('autoSendBtn');

    if (packetLimit === 0) {
        addLog('Set packet limit to auto-send packets', 'warning');
        return;
    }

    if (state.autoSendActive) {
        // Stop auto-send
        state.autoSendActive = false;
        if (state.autoSendTimer) clearInterval(state.autoSendTimer);
        autoSendBtn.textContent = 'Auto Send';
        autoSendBtn.style.opacity = '1';
        addLog('Auto-send stopped', 'info');
    } else {
        // Start auto-send
        state.autoSendActive = true;
        autoSendBtn.textContent = 'Stop Auto Send';
        autoSendBtn.style.opacity = '0.7';
        addLog(`Auto-send started (limit: ${packetLimit} packets)`, 'info');

        const interval = parseInt(document.getElementById('autoSendInterval').value);

        // Function to send next packet
        const sendNext = () => {
            if (!state.autoSendActive) return;

            const currentLimit = parseInt(document.getElementById('packetLimit').value);

            if (state.packetsSent >= currentLimit) {
                // Stop auto-send when limit reached
                state.autoSendActive = false;
                if (state.autoSendTimer) clearInterval(state.autoSendTimer);
                autoSendBtn.textContent = 'Auto Send';
                autoSendBtn.style.opacity = '1';
                addLog(`Packet limit reached (${currentLimit} packets sent)`, 'success');
                return;
            }

            // Send packet and schedule next one
            sendPacket();
            state.autoSendTimer = setTimeout(sendNext, interval);
        };

        sendNext();
    }
}

// Utility: Calculate simple checksum
function calculateChecksum(data) {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
        sum += data.charCodeAt(i);
    }
    return sum % 256;
}

// Utility: Add log entry
function addLog(message, type = 'info') {
    const eventLog = document.getElementById('eventLog');
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;
}

// Utility: Animate packet across diagram
function animatePacket(duration, onComplete) {
    const svg = document.getElementById('packetSvg');
    svg.innerHTML = '';

    const packet = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    packet.setAttribute('x', '10');
    packet.setAttribute('y', '50');
    packet.setAttribute('width', '40');
    packet.setAttribute('height', '30');
    packet.setAttribute('fill', '#667eea');
    packet.setAttribute('rx', '4');
    svg.appendChild(packet);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '30');
    text.setAttribute('y', '70');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-weight', 'bold');
    text.textContent = 'PKT';
    svg.appendChild(text);

    const startX = 10;
    const endX = svg.clientWidth - 50;
    const startTime = Date.now();

    function frame() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const x = startX + (endX - startX) * progress;

        packet.setAttribute('x', x);
        text.setAttribute('x', x + 20);

        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            if (onComplete) onComplete();
        }
    }

    requestAnimationFrame(frame);
}

// Main: Send packet
function sendPacket() {
    if (state.animationInProgress) {
        addLog('Animation in progress, please wait', 'warning');
        return;
    }

    // Get form values
    const sourcePort = parseInt(document.getElementById('sourcePort').value);
    const destPort = parseInt(document.getElementById('destPort').value);
    const seqNum = parseInt(document.getElementById('seqNum').value);
    const payloadData = document.getElementById('packetData').value || 'Hello';
    const packetSize = convertPacketSize();
    const lossRate = parseFloat(document.getElementById('lossRate').value);
    const delay = parseFloat(document.getElementById('delay').value);
    const corruptionRate = parseFloat(document.getElementById('corruptionRate').value);
    const timeout = parseFloat(document.getElementById('timeout').value);
    const jitter = parseFloat(document.getElementById('jitter').value);
    const bandwidth = parseFloat(document.getElementById('bandwidth').value);

    // Create packet with UDP header
    const packet = {
        srcPort: sourcePort,
        dstPort: destPort,
        seqNum: seqNum,
        payload: payloadData,
        size: packetSize,
        length: 8 + payloadData.length, // UDP header (8 bytes) + payload
        checksum: calculateChecksum(payloadData),
        timestamp: Date.now(),
        retransmitted: false
    };

    state.currentPacket = packet;
    state.animationInProgress = true;

    // Update UI with full packet details
    document.getElementById('info-srcport').textContent = packet.srcPort;
    document.getElementById('info-dstport').textContent = packet.dstPort;
    document.getElementById('info-length').textContent = formatBytes(packet.length);
    document.getElementById('info-checksum').textContent = packet.checksum;
    document.getElementById('info-seq').textContent = packet.seqNum;
    document.getElementById('info-data').textContent = packet.payload;
    document.getElementById('info-size').textContent = formatBytes(packet.size);
    document.getElementById('senderState').textContent = 'Sending...';
    document.getElementById('info-status').textContent = 'In Transit';

    addLog(`UDP Packet sent (${sourcePort} → ${destPort}, Seq: ${seqNum})`, 'info');
    state.packetsSent++;
    document.getElementById('packetsSent').textContent = state.packetsSent;

    // Simulate transmission with delay
    animatePacket(delay, () => {
        simulateTransmission(packet, lossRate, corruptionRate, timeout);
    });
}

// Simulate packet transmission (loss, corruption, etc)
function simulateTransmission(packet, lossRate, corruptionRate, timeout) {
    const lossChance = Math.random() * 100;
    const corruptionChance = Math.random() * 100;

    if (lossChance < lossRate) {
        // Packet lost
        state.packetsLost++;
        document.getElementById('info-status').textContent = 'Lost';
        document.getElementById('networkStatus').textContent = 'Packet Lost';
        addLog(`Packet ${packet.seqNum} LOST (Random loss)`, 'error');

        // Timeout and retransmit
        setTimeout(() => {
            handleTimeout(packet);
        }, timeout);
    } else if (corruptionChance < corruptionRate) {
        // Packet corrupted
        packet.checksum = Math.floor(Math.random() * 256);
        document.getElementById('info-status').textContent = 'Corrupted';
        document.getElementById('networkStatus').textContent = 'Packet Corrupted';
        addLog(`Packet ${packet.seqNum} CORRUPTED (Checksum mismatch)`, 'error');

        // Receiver rejects, timeout and retransmit
        setTimeout(() => {
            handleTimeout(packet);
        }, timeout);
    } else {
        // Packet successfully received
        simulateReceiver(packet);
    }
}

// Simulate receiver processing
function simulateReceiver(packet) {
    document.getElementById('receiverState').textContent = 'Processing...';
    document.getElementById('networkStatus').textContent = 'Packet Received';

    setTimeout(() => {
        // Send ACK back
        document.getElementById('info-status').textContent = 'ACK Sent';
        document.getElementById('receiverState').textContent = `ACK ${packet.seqNum}`;
        state.acksReceived++;
        document.getElementById('acksReceived').textContent = state.acksReceived;
        addLog(`ACK ${packet.seqNum} received by sender`, 'success');

        // Update sender state
        setTimeout(() => {
            document.getElementById('senderState').textContent = 'Ready';
            document.getElementById('receiverState').textContent = 'Waiting';
            document.getElementById('networkStatus').textContent = 'Idle';
            state.animationInProgress = false;
        }, 500);
    }, 200);
}

// Handle timeout/retransmission
function handleTimeout(packet) {
    document.getElementById('senderState').textContent = 'Timeout!';
    addLog(`Timeout on Packet ${packet.seqNum}, retransmitting...`, 'warning');
    state.retransmissions++;
    document.getElementById('retransmissions').textContent = state.retransmissions;

    // Re-transmit after brief delay
    setTimeout(() => {
        document.getElementById('senderState').textContent = 'Resending...';
        document.getElementById('info-status').textContent = 'Retransmitting';
        addLog(`Packet ${packet.seqNum} retransmitted`, 'warning');

        // Simulate retransmission with slightly better conditions
        animatePacket(200, () => {
            simulateTransmission(packet, 5, 2, parseInt(document.getElementById('timeout').value));
        });
    }, 300);
}

// Reset simulation
function resetSimulation() {
    // Stop auto-send if running
    if (state.autoSendActive) {
        state.autoSendActive = false;
        if (state.autoSendTimer) clearTimeout(state.autoSendTimer);
        document.getElementById('autoSendBtn').textContent = 'Auto Send';
        document.getElementById('autoSendBtn').style.opacity = '1';
    }

    state.packetsSent = 0;
    state.acksReceived = 0;
    state.retransmissions = 0;
    state.packetsLost = 0;
    state.animationInProgress = false;

    // Reset UI
    document.getElementById('packetsSent').textContent = '0';
    document.getElementById('acksReceived').textContent = '0';
    document.getElementById('retransmissions').textContent = '0';
    document.getElementById('packetLoss').textContent = '0';

    document.getElementById('senderState').textContent = 'Ready';
    document.getElementById('receiverState').textContent = 'Waiting';
    document.getElementById('networkStatus').textContent = 'Idle';

    document.getElementById('info-seq').textContent = '—';
    document.getElementById('info-data').textContent = '—';
    document.getElementById('info-size').textContent = '—';
    document.getElementById('info-checksum').textContent = '—';
    document.getElementById('info-status').textContent = '—';
    document.getElementById('info-srcport').textContent = '—';
    document.getElementById('info-dstport').textContent = '—';
    document.getElementById('info-length').textContent = '—';

    const svg = document.getElementById('packetSvg');
    svg.innerHTML = '';

    const eventLog = document.getElementById('eventLog');
    eventLog.innerHTML = '<div class="log-entry log-info">System reset</div>';

    addLog('Simulation reset', 'info');
}