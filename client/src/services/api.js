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
 * Upload a file with progress tracking
 * @param {FormData} formData 
 * @param {Function} onProgress 
 */
export const uploadFile = async (formData, onProgress) => {
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });
  return response.data;
};

/**
 * Get metadata for a file code
 * @param {string} code 
 */
export const getFileMetadata = async (code) => {
  const response = await api.get(`/${code}`);
  return response.data;
};

/**
 * Trigger file download stream or redirect URL
 * @param {string} code 
 * @param {string} password 
 * @param {boolean} inline
 */
export const getDownloadUrl = (code, password = '', inline = false) => {
  let url = `${API_BASE_URL}/${code}/download`;
  const params = new URLSearchParams();
  if (password) params.append('password', password);
  if (inline) params.append('inline', 'true');
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
};

/**
 * Delete file early
 * @param {string} code 
 */
export const deleteFile = async (code) => {
  const response = await api.delete(`/${code}`);
  return response.data;
};

/**
 * Fetch files shared by current user only
 */
export const fetchMySharedFiles = async () => {
  const response = await api.get('/my-shared');
  return response.data;
};

export default api;
