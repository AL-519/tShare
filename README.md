# ⚡ TempVault — Temporary File Transfer Web App (MERN Stack)

TempVault is a full-stack **temporary file transfer application**. Users upload a file, receive a short unique **6-digit share code**, share the code or QR code out-of-band, and recipients download the file. Every uploaded file automatically self-destructs (purged from storage and MongoDB) when its expiry duration window finishes (max 24 hours).

---

## 🚀 Key Features

- **Drag & Drop Upload**: Click-to-browse or drag-and-drop file uploader up to 200MB.
- **Short Shareable Codes**: Generates 6–8 character URL-safe, non-ambiguous codes (e.g. `7X9K2M`).
- **QR Code Sharing**: Rendered QR code for instant mobile phone camera scanning and download.
- **User Device Storage (Zero Server Disk Usage)**:
  - **IndexedDB Device Storage**: Stores files directly in the uploader's browser IndexedDB on their device. Zero bytes saved on server disk!
  - **ImageKit CDN**: Option to use `@imagekit/nodejs` SDK for cloud-hosted CDN storage & delivery.
- **Shared Files View**: `/shared-files` dashboard restricted to files uploaded by the current user session (tracked via HTTP cookies).
- **Self-Destruct & Cron Cleanup**: Scheduled `node-cron` job runs every 5 minutes to purge files and delete MongoDB records upon expiry.
- **Optional File Protection**:
  - **Password Protection**: Option to lock downloads behind a password.
  - **Max Downloads Limit**: Auto-expire after N downloads (e.g., auto-delete after 1 download).
- **Live Countdown Timer**: Real-time ticking `HH:MM:SS` timer on the download page showing time remaining until self-destruction.

---

## 🛠️ Tech Stack

- **Frontend**: React (Vite), React Router DOM v6, Tailwind CSS, Axios, Lucide Icons, QRCode.react, Browser IndexedDB API
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose Schema with TTL index backstop)
- **File Storage**: User Device Local Storage (`IndexedDB`) / ImageKit CDN (`@imagekit/nodejs`)
- **Cron Jobs**: `node-cron`

---

## 📁 Directory Structure

```
temporary-cloud/
├── server/
│   ├── config/
│   │   └── db.js                 # MongoDB connection & fallback logic
│   ├── controllers/
│   │   └── fileController.js     # Upload, metadata, download, delete, & stream relay controllers
│   ├── middleware/
│   │   ├── cookieParser.js       # HTTP cookie parser middleware
│   │   ├── errorHandler.js       # Express error handling
│   │   └── rateLimiter.js        # Express rate limiting
│   ├── models/
│   │   └── File.js               # Mongoose schema & TTL index
│   ├── routes/
│   │   └── fileRoutes.js         # Express REST API routes
│   ├── services/
│   │   ├── storage.services.js   # Storage service (Device IndexedDB + ImageKit)
│   │   └── codeGenerator.js      # Short code generator
│   ├── jobs/
│   │   └── cleanupCron.js        # node-cron file purge task
│   ├── .env                      # Environment config file
│   ├── index.js                  # Express app entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx        # Navigation bar
│   │   │   ├── Dropzone.jsx      # File upload dropzone
│   │   │   ├── UploadModal.jsx   # Upload progress & code/QR code modal
│   │   │   ├── Toast.jsx         # Custom notifications
│   │   ├── pages/
│   │   │   ├── HomePage.jsx      # Main landing & search page
│   │   │   ├── DownloadPage.jsx  # Download page with countdown timer
│   │   │   └── SharedFilesPage.jsx # Shared files page for user-scoped files
│   │   ├── services/
│   │   │   ├── api.js            # Axios client layer
│   │   │   ├── db.js             # IndexedDB browser storage service
│   │   │   └── streamRelay.js    # Peer stream relay service
│   │   ├── App.jsx               # React Router layout
│   │   └── index.css             # Glassmorphism styling
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the `server` directory:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/temp_cloud
STORAGE_PROVIDER=device_local   # or "imagekit"
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_FOLDER_NAME=/temp_uploads   # Optional ImageKit Media Library folder
MAX_FILE_SIZE_MB=200
MAX_EXPIRY_HOURS=24
CLIENT_ORIGIN=http://localhost:5173
```

---

## 📡 API Endpoints Summary

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/files/upload` | Registers metadata for Device Local Storage or uploads file to ImageKit CDN |
| `GET` | `/api/files/my-shared` | Returns active files uploaded by the current user session (via HTTP cookies) |
| `GET` | `/api/files/:code` | Fetches metadata for download page (checks expiry & password requirement) |
| `GET` | `/api/files/:code/download` | Streams file from IndexedDB / peer relay or redirects to ImageKit CDN URL |
| `GET` | `/api/files/stream-check/:code` | Checks pending peer download requests for device-local storage files |
| `POST` | `/api/files/stream-chunk/:code` | Receives file chunk stream from uploader browser to pipe to recipient |
| `DELETE` | `/api/files/:code` | Manually purges file from DB and browser IndexedDB |

---

## 💻 Running the Application Locally

### 1. Start Backend Server
```bash
cd server
npm install
npm run dev
```
Backend runs on `http://localhost:5000`

### 2. Start Frontend App
```bash
cd client
npm install
npm run dev
```
Frontend runs on `http://localhost:5173`
