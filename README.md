# ⚡ TShare — Direct Peer-to-Peer Ephemeral File Transfer

TShare is a fast, lightweight, and private peer-to-peer web application designed for secure, direct file transfers between devices. By leveraging browser IndexedDB storage and direct WebRTC data channels with server-assisted relay fallback, TShare streams files directly between peers with zero server disk bloat and zero memory limits.

---

## ✨ Features

- **Direct Peer-to-Peer Transfer**: Streams files directly between browsers via WebRTC with an automated HTTP piece relay fallback if peer negotiation is restricted.
- **Zero Server Storage Overhead**: Files reside securely in sender browser IndexedDB storage (`TShareDeviceStorage`) rather than uploading gigabytes of data to server disks or RAM.
- **1-Click Launchers**:
  - **`Launch.html`**: Interactive desktop dashboard with live backend connection diagnostics and LAN access addresses.
  - **`Launch.hta`**: Windows 1-click launcher that boots the Node.js server in the background and opens your default browser.
- **Local Network Discovery (mDNS & LLMNR)**:
  - Broadcasts `http://tshare.local:21844` and `http://tshare:21844` across your local Wi-Fi / LAN so phones, tablets, and laptops can connect without typing manual IP addresses.
  - Integrated port 80 helper (when permitted) to allow typing simply `http://tshare`.
- **Automatic Server Lifecycle & Shutdown Controls**:
  - Uses Server-Sent Events (SSE) and heartbeat beacons to track open browser tabs.
  - Automatically shuts down the background server and frees port `21844` once all tabs are closed (supports `ENABLE_AUTO_SHUTDOWN=false` for persistent server deployments).
  - Explicit Server Shutdown button in the navigation bar with an interactive confirmation pop-up modal to prevent accidental terminations.
- **Custom Download Location**: Save transferred files directly to your chosen disk location via the browser File System Access API.
- **Dedicated Downloads Manager**: Centralized queue and history manager to monitor active downloads and retrieve received files.
- **Dual View Modes**:
  - **Normal Mode**: Clean, streamlined interface for fast drag-and-drop transfers.
  - **Detailed Mode**: Comprehensive diagnostic dashboard showing real-time transfer speeds, piece chunks, peer swarm health, and access codes.
- **Access Codes & QR Code Sharing**: Instant 6-character access codes and auto-generated QR codes for effortless mobile transfers.
- **Configurable Link Expiration**: Set expiration windows (10 minutes, 1 hour, 6 hours, 24 hours, 1 week, 1 month, or indefinite).
- **Security & Cryptographic Protections**:
  - **Password-Protected Locked Folder**: Sensitive files are placed in an encrypted folder container. Filenames and file metadata are concealed until the recipient enters the password to unlock the folder.
  - **WebRTC Signal Authorization**: Prevents unauthorized WebRTC data channel bypass by requiring a verified unlock token before peer chunk transfer begins.
  - **End-to-End Cryptographic SHA-256 Verification**: Computes a SHA-256 digest at upload and verifies the assembled file byte-by-byte on download to protect against swarm piece poisoning or tampering.
  - **Executable File Security Alert**: Automatically detects high-risk executable formats (`.exe`, `.bat`, `.cmd`, `.msi`, `.ps1`, `.scr`) and warns users before downloading or executing.
  - **Rate Limiting & Anti-Brute-Force**: Throttles lookups, password attempts, and WebRTC signaling to defend against enumeration attacks.
  - **Safety Guidelines & Server Disclaimer**: Built-in guideline documentation on verifying sources, scanning downloads, and platform liability protections.
- **Embedded Database**: Zero-configuration, high-performance embedded SQLite database (`better-sqlite3`) for metadata and audit logging.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v16.0 or higher
- **Zero Database Setup**: Includes embedded SQLite; no external database servers required.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd tshare
   ```

2. **Install dependencies**:
   ```bash
   # One-command installation for both server and client:
   npm run install:all

   # Or install manually:
   cd server && npm install && cd ..
   cd client && npm install && cd ..
   ```

3. **Environment Configuration (`.env`)**:

   > [!NOTE]
   > TShare is designed to work **out-of-the-box with zero setup**. If no `.env` file exists, the application automatically provisions a default `server/.env` file on startup (`npm start`) with safe defaults.

   To customize configuration manually, create a `.env` file in the **`server/`** directory (or project root):

   ```env
   # Server Port (default: 21844)
   PORT=21844

   # Path to embedded SQLite database
   SQLITE_DB_PATH=./data/tshare.sqlite

   # Allowed client origins for CORS (comma-separated; localhost & LAN are auto-trusted)
   CLIENT_ORIGIN=http://localhost:21844

   # Maximum file size for relay chunk transfers in MB (default: 200)
   MAX_FILE_SIZE_MB=200

   # Automatically shut down background server when all browser tabs close (default: true)
   ENABLE_AUTO_SHUTDOWN=true

   # Node environment (development / production)
   NODE_ENV=development
   ```

   | Variable | Default | Description |
   | :--- | :--- | :--- |
   | `PORT` | `21844` | Port number for the Express backend server. |
   | `SQLITE_DB_PATH` | `./data/tshare.sqlite` | SQLite database file location for metadata storage. |
   | `CLIENT_ORIGIN` | `http://localhost:21844` | Allowed CORS origins (LAN & localhost are permitted by default). |
   | `MAX_FILE_SIZE_MB` | `200` | Max file upload limit in MB for HTTP relay fallback. |
   | `ENABLE_AUTO_SHUTDOWN` | `true` | Auto-terminates server process when all tabs close (`false` for persistent servers). |
   | `NODE_ENV` | `development` | Runtime mode (`development` or `production`). |

4. **Build the Client**:
   ```bash
   npm run build
   ```

5. **Start the Application**:
   ```bash
   npm start
   ```

   The application runs on port **`21844`**:
   - Local: **`http://localhost:21844`**
   - Wi-Fi / LAN: **`http://tshare.local:21844`** or **`http://tshare:21844`**

---

## 🖥️ Development Mode

To run backend and frontend development servers concurrently:

```bash
# Terminal 1: Express Backend Server
npm run server

# Terminal 2: Vite Client Dev Server
npm run client
```

---

## ⚡ 1-Click Windows Launch

For quick local usage on Windows without manually running terminal commands:
- Double-click **`Launch.hta`** to start the background server and open TShare in your browser.
- Or open **`Launch.html`** to verify connection status, view local network URLs, and access the application.

---

## 🌐 Supported Browsers

TShare supports all modern web standards and browsers:
- Google Chrome (Desktop & Mobile)
- Microsoft Edge
- Brave Browser
- Mozilla Firefox
- Apple Safari (macOS & iOS)
- Opera

---

## 📄 License

This project is licensed under the MIT License.
