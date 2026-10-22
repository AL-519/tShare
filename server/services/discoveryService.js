/**
 * ⚡ TShare Local Network Name Discovery Service (mDNS + LLMNR Responder)
 *
 * Enables devices on the same Wi-Fi / IP subnet to find and connect to this TShare
 * laptop server by simply searching or typing "tshare" or "tshare.local" in any browser.
 *
 * Implements:
 *   1. mDNS Responder (UDP 5353 / 224.0.0.251) for "tshare.local" & "tshare" (iOS, Mac, Android, Windows)
 *   2. LLMNR Responder (UDP 5355 / 224.0.0.252) for "tshare" (Windows, Linux, Android)
 *   3. Secondary Port 80 HTTP listener (if permitted) so users can type just "http://tshare"
 *      without having to include the port number ":21849".
 */

const dgram = require('dgram');
const os = require('os');
const http = require('http');

class DiscoveryService {
  constructor() {
    this.mdnsSocket = null;
    this.llmnrSocket = null;
    this.port80Server = null;
    this.mainPort = 21844;
    this.localIp = null;
    this.localIpBytes = null;
  }

  init(mainPort = 21844, expressApp = null) {
    this.mainPort = mainPort;
    this.refreshLocalIp();

    if (!this.localIp) {
      console.log('[Discovery] No non-internal IPv4 interface found. Local discovery disabled.');
      return;
    }

    console.log(`[Discovery] Initializing Wi-Fi / LAN name resolution for 'tshare' (IP: ${this.localIp})...`);

    this.startMdns();
    this.startLlmnr();
    this.startPort80Redirect(expressApp);
  }

  refreshLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          this.localIp = iface.address;
          this.localIpBytes = iface.address.split('.').map((n) => parseInt(n, 10));
          return;
        }
      }
    }
  }

  // ==========================================================================
  // 1. Multicast DNS (mDNS) Responder — Port 5353 (tshare.local / tshare)
  // ==========================================================================
  startMdns() {
    try {
      this.mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.mdnsSocket.on('error', (err) => {
        // Port 5353 may be bound exclusively by system service; continue smoothly
        console.log(`[Discovery] mDNS socket note: ${err.message}`);
      });

      this.mdnsSocket.on('message', (msg, rinfo) => {
        this.handleDnsQuery(msg, rinfo, this.mdnsSocket, true);
      });

      this.mdnsSocket.bind(5353, '0.0.0.0', () => {
        try {
          this.mdnsSocket.addMembership('224.0.0.251');
          this.mdnsSocket.setMulticastTTL(255);
          this.mdnsSocket.setMulticastLoopback(true);
          console.log(`[Discovery] 🟢 mDNS active: Other devices can browse http://tshare.local:${this.mainPort}`);
        } catch (e) {
          // Membership error fallback
        }
      });
    } catch (err) {
      console.log('[Discovery] Could not initialize mDNS:', err.message);
    }
  }

  // ==========================================================================
  // 2. Link-Local Multicast Name Resolution (LLMNR) Responder — Port 5355 (tshare)
  // ==========================================================================
  startLlmnr() {
    try {
      this.llmnrSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.llmnrSocket.on('error', (err) => {
        console.log(`[Discovery] LLMNR socket note: ${err.message}`);
      });

      this.llmnrSocket.on('message', (msg, rinfo) => {
        this.handleDnsQuery(msg, rinfo, this.llmnrSocket, false);
      });

      this.llmnrSocket.bind(5355, '0.0.0.0', () => {
        try {
          this.llmnrSocket.addMembership('224.0.0.252');
          this.llmnrSocket.setMulticastTTL(255);
          this.llmnrSocket.setMulticastLoopback(true);
          console.log(`[Discovery] 🟢 LLMNR active: Windows/LAN devices can search http://tshare:${this.mainPort}`);
        } catch (e) {
          // Membership error fallback
        }
      });
    } catch (err) {
      console.log('[Discovery] Could not initialize LLMNR:', err.message);
    }
  }

  // ==========================================================================
  // DNS Packet Parser and Responder for 'tshare' and 'tshare.local'
  // ==========================================================================
  handleDnsQuery(msg, rinfo, socket, isMdns) {
    if (msg.length < 12 || !this.localIpBytes) return;

    // Rate-limiting: prevent UDP query flooding & amplification attacks (max 30 replies/sec)
    const now = Date.now();
    if (!this.lastDnsReset || now - this.lastDnsReset > 1000) {
      this.lastDnsReset = now;
      this.dnsReplyTokens = 30;
    }
    if (this.dnsReplyTokens <= 0) {
      return; // Drop excess requests to avoid amplification
    }

    try {
      const qdCount = msg.readUInt16BE(4);
      if (qdCount < 1) return;

      // Parse question name
      let offset = 12;
      const labels = [];
      while (offset < msg.length) {
        const len = msg[offset++];
        if (len === 0) break;
        if (offset + len > msg.length) return;
        labels.push(msg.slice(offset, offset + len).toString('ascii').toLowerCase());
        offset += len;
      }

      const qName = labels.join('.');
      // Check if queried hostname matches 'tshare' or 'tshare.local'
      if (qName !== 'tshare' && qName !== 'tshare.local') {
        return;
      }

      // Explicit bounds check before reading type and class
      if (offset + 4 > msg.length) return;

      const qType = msg.readUInt16BE(offset); // 1 = Type A (IPv4)
      if (qType !== 1 && qType !== 255) return; // Only answer A or ANY queries

      const txId = msg.readUInt16BE(0);
      const questionEnd = offset + 4;
      const questionSection = msg.slice(12, questionEnd);

      // Build DNS Answer packet
      const header = Buffer.alloc(12);
      header.writeUInt16BE(txId, 0); // Tx ID
      header.writeUInt16BE(isMdns ? 0x8400 : 0x8000, 2); // Standard Response Flags
      header.writeUInt16BE(1, 4); // Questions: 1
      header.writeUInt16BE(1, 6); // Answers: 1
      header.writeUInt16BE(0, 8); // Authority: 0
      header.writeUInt16BE(0, 10); // Additional: 0

      // Answer Record: Name Pointer (0xc00c points to question name at offset 12)
      const answer = Buffer.alloc(16);
      answer.writeUInt16BE(0xc00c, 0); // Pointer to question name
      answer.writeUInt16BE(1, 2); // Type A
      answer.writeUInt16BE(1, 4); // Class IN
      answer.writeUInt32BE(120, 6); // TTL 120s
      answer.writeUInt16BE(4, 10); // Data length = 4
      answer[12] = this.localIpBytes[0];
      answer[13] = this.localIpBytes[1];
      answer[14] = this.localIpBytes[2];
      answer[15] = this.localIpBytes[3];

      const responsePacket = Buffer.concat([header, questionSection, answer]);

      // Reply back to querier or multicast group
      const targetHost = isMdns ? '224.0.0.251' : rinfo.address;
      const targetPort = isMdns ? 5353 : rinfo.port;

      this.dnsReplyTokens--;
      socket.send(responsePacket, 0, responsePacket.length, targetPort, targetHost, (err) => {
        if (!err) {
          console.log(`[Discovery] 📡 Answered DNS query for '${qName}' -> ${this.localIp} to ${rinfo.address}`);
        }
      });
    } catch (e) {
      // Ignore malformed query packets
    }
  }

  // ==========================================================================
  // 3. Port 80 Forwarder / Helper (Allows typing just "http://tshare" without :21844)
  // ==========================================================================
  startPort80Redirect(expressApp) {
    // If port 80 is available on the machine, bind it so typing http://tshare connects directly!
    try {
      this.port80Server = http.createServer((req, res) => {
        try {
          const rawHost = req.headers.host || 'localhost';
          const cleanHost = rawHost.split(':')[0].replace(/[^a-zA-Z0-9.-]/g, '').toLowerCase() || 'localhost';
          
          // Whitelist allowed local and LAN hostnames to prevent open redirect / host header injection
          const isAllowedHost = 
            cleanHost === 'localhost' ||
            cleanHost === '127.0.0.1' ||
            cleanHost === 'tshare' ||
            cleanHost === 'tshare.local' ||
            cleanHost === this.localIp ||
            /^192\.168\.\d+\.\d+$/.test(cleanHost) ||
            /^10\.\d+\.\d+\.\d+$/.test(cleanHost) ||
            /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(cleanHost);

          const safeHost = isAllowedHost ? cleanHost : (this.localIp || 'localhost');
          const cleanPath = (req.url || '/').replace(/[\r\n]/g, '').slice(0, 500);
          const targetUrl = `http://${safeHost}:${this.mainPort}${cleanPath}`;
          res.writeHead(302, { Location: targetUrl });
          res.end();
        } catch (_) {
          res.writeHead(400);
          res.end('Bad Request');
        }
      });

      this.port80Server.on('error', (err) => {
        // Port 80 usually requires administrator privileges or is bound by IIS.
        // It's completely optional; main port handles all direct traffic.
      });

      this.port80Server.listen(80, '0.0.0.0', () => {
        console.log(`[Discovery] 🌐 Port 80 active: Other devices can connect simply using http://tshare or http://tshare.local`);
      });
    } catch (_) {
      // Ignore if port 80 unavailable
    }
  }

  close() {
    try {
      if (this.mdnsSocket) this.mdnsSocket.close();
      if (this.llmnrSocket) this.llmnrSocket.close();
      if (this.port80Server) this.port80Server.close();
    } catch (_) {}
  }
}

const discoveryService = new DiscoveryService();
module.exports = discoveryService;
