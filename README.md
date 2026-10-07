# ⚡ TempVault — Fast, Secure Ephemeral File Transfer

TempVault is a modern, responsive web application for direct, secure file sharing between devices. Designed with a clean aesthetic, it provides seamless ephemeral file sharing with customizable link expiries, password security, and flexible view modes.

---

## ✨ Features

- **Direct File Transfer**: Share files directly between devices without artificial file size limitations.
- **Custom Download Location**: Select the exact folder and location on your computer where downloaded files will be saved.
- **Granular Deletion Controls**: 
  - Permanently delete files and active links, or
  - Remove entries from your shared list while preserving local files on your device.
- **Dual View Modes**:
  - **Normal Mode**: A clean, minimalistic, user-friendly interface designed for quick and effortless sharing.
  - **Detailed Mode**: An informative diagnostic dashboard with transfer statistics, peer activity, and real-time status.
- **Theme Customization**: Sleek modern Dark theme by default, with an instant Light theme toggle in the navigation bar.
- **Short Access Codes & QR Codes**: Share files effortlessly via short, easy-to-read 6-character codes or scannable QR codes for mobile devices.
- **Configurable Link Expiration**: Set expiration windows ranging from 10 minutes, 1 hour, 6 hours, 24 hours, 1 week, 1 month, or indefinite (never expires).
- **Security & Access Controls**:
  - Optional password protection for sensitive transfers.
  - Cryptographic token-based creator verification with no login required.
- **Dedicated Downloads Management**:
  - Centralized downloads dashboard accessible from the navigation bar.
  - Batch / multiple downloads queue to retrieve multiple files concurrently.
  - Local device storage tracking with direct save-to-disk actions.
- **Three-Dots Vertical Action Options**:
  - Modular options dropdown (`...`) on file lists for clean, extensible actions.
  - One-click share link copying and granular deletion controls.
- **Personal Shared Dashboard**: Track and manage all active file shares created from your current browser session.

---

## 🚀 Quick Start

### Prerequisites

- **Node.js**: version 16.0 or higher
- **Zero Database Setup**: Uses a built-in, zero-configuration SQLite database stored securely within the server. No external database servers (such as MongoDB) are required.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd tempvault
   ```

2. **Install dependencies**:
   ```bash
   # Install server and client dependencies
   npm install
   cd client && npm install && cd ..
   ```

3. **Environment Setup**:
   Create an optional `.env` file in the root directory (or inside `server/`):
   ```env
   PORT=5000
   CLIENT_ORIGIN=http://localhost:5000
   NODE_ENV=production
   ```

4. **Build & Run**:
   Compile the client bundle and start the unified application server:
   ```bash
   npm start
   ```

   The application will be accessible at: **`http://localhost:5000`**

---

## 🖥️ Development Mode

To run the backend server and frontend development server separately with hot module reloading:

```bash
# Terminal 1: Backend API
npm run server

# Terminal 2: Frontend Vite Dev Server
npm run client
```

---

## 🌐 Browser Support

TempVault is built using modern web standards and supports all major modern web browsers:
- Google Chrome (Desktop & Mobile)
- Microsoft Edge
- Brave Browser
- Mozilla Firefox
- Apple Safari (macOS & iOS)
- Opera

---

## 📄 License

This project is licensed under the MIT License.
