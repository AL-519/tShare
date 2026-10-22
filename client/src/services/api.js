import axios from 'axios';

// API client pointing to Express server endpoint
const API_BASE_URL = '/api/files';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Send HTTP cookies for session & file ownership tracking
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Register file metadata for local torrent swarm (zero server disk & zero RAM overhead)
 * @param {Object} metadata 
 */
export const uploadFile = async (metadata) => {
  const response = await api.post('/upload', metadata);
  return response.data;
};

/**
 * Get metadata for a file code
 * @param {string} code 
 * @param {string} [unlockToken]
 */
export const getFileMetadata = async (code, unlockToken = null) => {
  const cleanCode = String(code).trim().toUpperCase();
  const headers = {};
  if (unlockToken) {
    headers['X-Unlock-Token'] = unlockToken;
  }
  const response = await api.get(`/${cleanCode}`, { headers });
  return response.data;
};

/**
 * Unlock a password-protected folder/container
 * @param {string} code
 * @param {string} password
 */
export const unlockFile = async (code, password) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.post(`/${cleanCode}/unlock`, { password });
  return response.data;
};

/**
 * Send periodic swarm heartbeat reporting files held by this browser client
 * @param {string} clientId 
 * @param {string[]} seedingCodes 
 */
export const sendSwarmHeartbeat = async (clientId, seedingCodes) => {
  const response = await api.post('/swarm/heartbeat', { clientId, seedingCodes });
  return response.data;
};

/**
 * Get real-time swarm health & seeder count for a file code
 * @param {string} code 
 */
export const fetchSwarmStatus = async (code) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.get(`/swarm/${cleanCode}/status`);
  return response.data;
};

/**
 * Recipient requests a specific piece from the swarm
 * Returns arrayBuffer of the chunk
 * @param {string} code 
 * @param {number} pieceIndex 
 * @param {string} password 
 * @param {string} clientId 
 * @param {string} [unlockToken]
 */
export const requestPiece = async (code, pieceIndex, password = '', clientId = '', unlockToken = null) => {
  const cleanCode = String(code).trim().toUpperCase();
  const headers = {};
  if (unlockToken) {
    headers['X-Unlock-Token'] = unlockToken;
  }
  const response = await api.post(
    `/swarm/${cleanCode}/request-piece`,
    { pieceIndex, password, clientId, unlockToken },
    { responseType: 'arraybuffer', headers }
  );
  return response.data; // ArrayBuffer
};

/**
 * Seeder checks for pending piece requests from recipients
 * @param {string} code 
 */
export const fetchPendingPieces = async (code) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.get(`/swarm/${cleanCode}/pending-pieces`);
  return response.data;
};

/**
 * Seeder serves a piece to fulfill a recipient request
 * @param {string} code 
 * @param {Object} payload { requestId, pieceIndex, pieceBase64, isLastPiece }
 */
export const servePiece = async (code, payload) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.post(`/swarm/${cleanCode}/serve-piece`, payload);
  return response.data;
};

/**
 * Send WebRTC signaling payload (offer, answer, candidate) to a peer via server coordinator
 * @param {string} code
 * @param {Object} payload { fromClientId, toClientId, signal }
 * @param {string} [unlockToken]
 */
export const sendSwarmSignal = async (code, payload, unlockToken = null) => {
  const cleanCode = String(code).trim().toUpperCase();
  const headers = {};
  if (unlockToken) {
    headers['X-Unlock-Token'] = unlockToken;
  }
  const response = await api.post(`/swarm/${cleanCode}/signal`, { ...payload, unlockToken }, { headers });
  return response.data;
};

/**
 * Fetch pending incoming WebRTC signals for this client
 * @param {string} code
 * @param {string} clientId
 */
export const fetchSwarmSignals = async (code, clientId) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.get(`/swarm/${cleanCode}/signals`, { params: { clientId } });
  return response.data;
};

/**
 * Notify server that download completed to update swarm download counters
 * @param {string} code
 */
export const notifyDownloadComplete = async (code) => {
  const cleanCode = String(code).trim().toUpperCase();
  const response = await api.post(`/swarm/${cleanCode}/complete`);
  return response.data;
};

/**
 * Delete file early by code (with cryptographic creator verification)
 * @param {string} code 
 * @param {string} [creatorToken] 
 */
export const deleteFile = async (code, creatorToken = null) => {
  const cleanCode = String(code).trim().toUpperCase();
  const headers = {};
  if (creatorToken) {
    headers['X-Creator-Token'] = creatorToken;
  }
  const response = await api.delete(`/${cleanCode}`, { headers });
  return response.data;
};

/**
 * Fetch files shared by current user session
 */
export const fetchMySharedFiles = async () => {
  const response = await api.get('/my-shared');
  return response.data;
};

/**
 * Explicit manual shutdown of local server
 */
export const shutdownServer = async () => {
  const response = await axios.post('/api/lifecycle/shutdown');
  return response.data;
};

export default api;
