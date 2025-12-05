# RDT Stop-and-Wait Protocol

A complete implementation of the **Reliable Data Transfer (RDT) Stop-and-Wait Protocol** featuring an interactive web simulator and a functional Node.js backend for actual UDP file transfer.

## Overview

This project demonstrates how to build reliable communication on top of an unreliable network layer. It implements the foundational Stop-and-Wait protocol with packet loss detection, corruption detection, and automatic retransmission.

**Key Features:**
- 🌐 Interactive web simulator with real-time visualization
- 💻 Node.js backend for actual UDP file transfer
- 📊 Network simulation (packet loss, corruption, delay)
- ✅ Checksum-based error detection
- 🔄 Automatic timeout and retransmission
- 📈 Real-time statistics and event logging

## Quick Start

### Option 1: Web Simulator (No Installation Required)

1. Open `index.html` in your web browser
2. Configure network conditions (loss rate, delay, corruption)
3. Click "Send Packet" or "Auto Send"
4. Watch real-time packet visualization and statistics

**Features:**
- Custom packet configuration (size, payload, ports)
- Network condition simulation
- Live packet animation
- Real-time statistics tracking
- Auto-send with packet limiting

### Option 2: Node.js Backend (Requires Node.js)

**Installation:**
```bash
npm install ws  # For WebSocket support (optional)
```

**Running the server:**

Terminal 1 - Start receiver:
```bash
node Receiver.js
```

Terminal 2 - Start sender:
```bash
node Sender.js
```

The receiver will write the transferred file to `received_file.txt`.

## Project Files

### Web Simulator
- **index.html** - Interactive UI with UDP packet visualization
- **styles.css** - Glassmorphism design with monochrome theme
- **script.js** - Main simulator logic and packet handling (334 lines)

### Node.js Implementation
- **Packet.js** - Packet structure with checksum validation (120 lines)
- **Pipe.js** - Network simulator for loss/corruption/delay (90 lines)
- **Sender.js** - Client implementation using Stop-and-Wait (240 lines)
- **Receiver.js** - Server implementation with ACK handling (260 lines)

### Documentation
- **README.md** - Project documentation
- **RDT_Professional_Presentation.pptx** - Professional presentation slides

## How the Protocol Works

### Stop-and-Wait Protocol Flow

```
Sender                              Receiver
  |                                    |
  +------ Packet 0 (seq=0) --------->  |
  |                                    +-- Validate checksum
  |                                    +-- Send ACK (seq=0)
  |  <------ ACK (seq=0) -----------+  |
  |                                    |
  +------ Packet 1 (seq=1) --------->  |
  |                                    +-- Validate checksum
  |  <------ ACK (seq=1) -----------+  |
  |                                    |
```

### Key Features

1. **Sequence Numbers (0 or 1)** - Toggle between packets to detect duplicates
2. **Checksums** - Detect corrupted packets using sum modulo 256
3. **Timeouts** - 2-second timeout triggers retransmission
4. **ACKs** - Receiver sends acknowledgments for each packet
5. **Retransmission** - Up to 5 attempts before failure

## Packet Structure

### Data Packet (12-512 bytes)
```
┌─────────────┬──────────┬──────────┬──────────┐
│ Checksum    │ Length   │ Seq Num  │ Payload  │
│ (2 bytes)   │ (2 bytes)│ (4 bytes)│ (0-500B) │
└─────────────┴──────────┴──────────┴──────────┘
```

### ACK Packet (8 bytes)
```
┌─────────────┬──────────┬──────────┐
│ Checksum    │ Length   │ Seq Num  │
│ (2 bytes)   │ (2 bytes)│ (4 bytes)│
└─────────────┴──────────┴──────────┘
```

## Testing

### Test Scenario 1: Perfect Network (No Loss)
```javascript
const receiver = new Receiver(5555, 1, 0, 0, 0);
```
**Expected:** All packets arrive first try, no retransmissions

### Test Scenario 2: 30% Packet Loss
```javascript
const receiver = new Receiver(5555, 1, 0.3, 0, 0);
```
**Expected:** See timeouts and retransmissions in action

### Test Scenario 3: 5% Corruption
```javascript
const receiver = new Receiver(5555, 1, 0, 0.05, 0);
```
**Expected:** Checksum validation catches corrupted packets

### Test Scenario 4: Combined (Realistic Network)
```javascript
const receiver = new Receiver(5555, 1, 0.2, 0.05, 200);
```
**Expected:** Multiple retransmissions with realistic delays

## Performance Metrics

The implementation tracks:
- **Packets Sent** - Total transmission attempts
- **ACKs Received** - Successful acknowledgments
- **Retransmissions** - Number of retry attempts
- **Timeouts** - Number of timeout events
- **Corrupted Packets** - Packets with checksum failures
- **Out of Order Packets** - Packets received out of sequence

## Example Output

```
[SERVER] Listening on port 5555
[SERVER] Window size: 1
[PIPE] Pipe [loss=0.00%, corruption=0.00%, delay=0ms]

[CLIENT] Started on port 5556
[CLIENT] Sending to localhost:5555
[CLIENT] File: test.txt
[CLIENT] Sent packet - Seq: 0, Size: 280
[CLIENT] ACK received for seq: 0

========== SENDER STATISTICS ==========
Packets Sent: 1
ACKs Received: 1
Retransmissions: 0
Timeouts: 0
========================================
```

## Architecture

### Web Simulator
- Browser-based, no installation needed
- Simulates network conditions in JavaScript
- Real-time visualization of packet transfer
- Useful for learning and visualization

### Node.js Backend
- Actual UDP socket implementation
- Real network simulation with configurable loss/corruption
- File transfer demonstration
- Production-ready code

## Technology Stack

**Frontend:**
- HTML5 - Structure
- CSS3 - Glassmorphism design
- JavaScript - Animation and simulation logic

**Backend:**
- Node.js - Runtime environment
- UDP Sockets (dgram) - Network communication
- File I/O - File transfer handling

## Code Quality

- **Object-Oriented Design** - Clean class structure
- **Error Handling** - Comprehensive validation
- **Logging** - Detailed console output for debugging
- **Documentation** - Well-commented code
- **Statistics** - Real-time metrics tracking

## Learning Outcomes

This project demonstrates:

✓ **Networking Fundamentals**
- How unreliable networks require reliability layers
- Importance of error detection and retransmission
- Role of timeouts in protocol design

✓ **Protocol Design**
- Simple but effective Stop-and-Wait approach
- Checksum implementation for error detection
- Sequence numbers for duplicate detection

✓ **Full-Stack Development**
- Frontend visualization and interaction
- Backend network communication
- Integration between web and native code

✓ **Software Engineering**
- Clean code principles
- Error handling and edge cases
- Testing and validation

## Future Enhancements

**Phase 2: Sliding Window Protocols**
- Implement Go-Back-N (GBN) protocol
- Implement Selective Repeat (SR) protocol
- Compare efficiency and performance

**Phase 3: Advanced Features**
- TCP-like congestion control
- Flow control with receiver window
- Real-time performance graphs
- WebSocket server integration

**Phase 4: Production Features**
- Persistent logging
- Performance benchmarking
- Advanced packet scheduling
- Network trace analysis

## Requirements

- **Web Simulator:** Modern web browser (Chrome, Firefox, Safari, Edge)
- **Node.js Backend:** Node.js 14+ and npm

## Installation

```bash
# Clone the repository
git clone https://github.com/Zshah2/RDT-Stop-and-Wait-Protocol.git
cd RDT-Stop-and-Wait-Protocol

# No additional dependencies needed for web simulator

# Optional: Install ws for WebSocket features
npm install ws
```

## Usage

### Web Simulator
```bash
# Simply open in browser
open index.html
# or
start index.html
```

### Backend
```bash
# Terminal 1
node Receiver.js

# Terminal 2
node Sender.js
```

## File Structure

```
RDT-Stop-and-Wait-Protocol/
├── index.html                          # Web interface
├── script.js                           # Simulator logic
├── styles.css                          # UI styling
├── Packet.js                           # Packet class
├── Pipe.js                             # Network simulator
├── Sender.js                           # Client implementation
├── Receiver.js                         # Server implementation
├── README.md                           # Documentation
├── RDT_Professional_Presentation.pptx  # Presentation
└── test.txt                            # Sample test file
```

## Presentation

A professional PowerPoint presentation is included with:
- Protocol overview and design
- Architecture and implementation details
- Test results and performance metrics
- Live demonstration walkthrough
- Key learnings and insights

## Contributing

This is an educational project. Feel free to:
- Fork and experiment
- Add new features
- Improve documentation
- Create pull requests

## Author

**Zshah2** - Network Programming Student

## License

This project is open source and available under the MIT License.

## References

- **Textbook:** "Computer Networking: A Top-Down Approach" by Kurose & Ross
- **Protocol Basics:** RFC 793 (TCP), UDP concepts
- **JavaScript:** MDN Web Docs, Node.js Documentation

## Support

For questions or issues:
1. Check the presentation slides for detailed explanations
2. Review the code comments for implementation details
3. Run test scenarios to understand protocol behavior
4. Refer to the learning outcomes section

---

**Last Updated:** November 2025  
**Status:** Complete and Production-Ready ✅
