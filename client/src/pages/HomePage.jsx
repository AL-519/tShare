import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropzone } from '../components/Dropzone';
import { UploadModal } from '../components/UploadModal';
import {
  Lock,
  Clock,
  Search,
  Shield,
  Upload,
  KeyRound,
  DownloadCloud,
  Zap,
  Sliders,
  Server,
  HardDrive
} from 'lucide-react';
import { uploadFile } from '../services/api';
import { saveLocalFile } from '../services/db';
import { startStreamRelayService } from '../services/streamRelay';

export const HomePage = ({ onToast }) => {
  const navigate = useNavigate();

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState(null);
  const [duration, setDuration] = useState('10m');
  const [storageProvider, setStorageProvider] = useState('device_local');
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Upload Progress & Modal State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  // Code Lookup State
  const [searchCode, setSearchCode] = useState('');

  // Start background stream relay service on page mount
  useEffect(() => {
    startStreamRelayService();
  }, []);

  // Handle Form Submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      onToast('Please select a file to upload.', 'error');
      return;
    }

    const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB cap
    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      onToast(`File size exceeds maximum allowed limit of 200 MB.`, 'error');
      return;
    }

    const formData = new FormData();
    formData.append('duration', duration);
    formData.append('storageProvider', storageProvider);
    formData.append('fileName', selectedFile.name);
    formData.append('fileSize', selectedFile.size);
    formData.append('mimeType', selectedFile.type || 'application/octet-stream');

    if (storageProvider !== 'device_local') {
      formData.append('file', selectedFile);
    }
    if (password) formData.append('password', password);
    if (maxDownloads) formData.append('maxDownloads', maxDownloads);

    try {
      setIsUploading(true);
      setUploadProgress(10);
      console.log(`[Upload] Initiating upload process. Storage provider: '${storageProvider}', file: '${selectedFile.name}', size: ${selectedFile.size} bytes.`);

      const result = await uploadFile(formData, (percent) => {
        console.log(`[Upload Progress] Server upload progress: ${percent}%`);
        setUploadProgress(percent);
      });

      console.log('[Upload] Server upload metadata response:', result);

      // Save file blob to browser IndexedDB if device_local is selected
      if (storageProvider === 'device_local') {
        console.log(`[Upload] Storage provider is 'device_local'. Saving blob to browser IndexedDB for code '${result.code}'...`);
        setUploadProgress(80);
        const savedRecord = await saveLocalFile(result.code, selectedFile, {
          originalName: selectedFile.name,
          mimeType: selectedFile.type,
          size: selectedFile.size,
          expiresAt: result.file?.expiresAt,
        });
        console.log('[Upload SUCCESS] Blob saved to IndexedDB:', savedRecord);
      }

      setUploadProgress(100);
      setIsUploading(false);
      setUploadResult(result);
      onToast('File shared successfully on your device storage!', 'success');
    } catch (error) {
      console.error('[Upload ERROR] Upload failed:', error.response?.data || error.message || error);
      setIsUploading(false);
      const msg = error.response?.data?.message || 'Failed to upload file. Please try again.';
      onToast(msg, 'error');
    }
  };

  const handleResetUpload = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setPassword('');
    setMaxDownloads('');
  };

  // Handle Code Search Submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const cleanCode = searchCode.trim();
    if (!cleanCode) {
      onToast('Please enter a file code.', 'error');
      return;
    }
    navigate(`/download/${cleanCode}`);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">

      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto mb-12 animate-fade-in">
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Transfer Files Temporarily. <br />
          <span className="text-gradient">Zero Server Disk Storage.</span>
        </h1>
        <p className="text-slate-400 text-base sm:text-lg">
          Files are stored locally on your device browser and shared directly without taking up server disk space or ImageKit quota.
        </p>
      </div>

      {/* Main Grid: Upload Card & Code Search Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Upload Card (7 Cols) */}
        <div className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-xl text-slate-100">Upload Temporary File</h2>
              <p className="text-xs text-slate-400">Select expiry window and destination storage</p>
            </div>
          </div>

          <form onSubmit={handleUploadSubmit} className="space-y-6">

            {/* File Dropzone */}
            <Dropzone
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              onFileRemove={() => setSelectedFile(null)}
              onFileError={(msg) => onToast(msg, 'error')}
            />

            {/* Basic Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Expiry Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Self-Destruct Window
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="10m" className="bg-slate-900 text-slate-200">10 Minutes</option>
                  <option value="1h" className="bg-slate-900 text-slate-200">1 Hour</option>
                  <option value="6h" className="bg-slate-900 text-slate-200">6 Hours</option>
                  <option value="12h" className="bg-slate-900 text-slate-200">12 Hours</option>
                  <option value="24h" className="bg-slate-900 text-slate-200">24 Hours (Max)</option>
                </select>
              </div>

              {/* Storage Destination Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                  Storage Provider
                </label>
                <select
                  value={storageProvider}
                  onChange={(e) => setStorageProvider(e.target.value)}
                  className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="device_local" className="bg-slate-900 text-slate-200">User Device Storage (IndexedDB • 0 Server Disk)</option>
                  <option value="imagekit" className="bg-slate-900 text-slate-200">ImageKit CDN Storage</option>
                </select>
              </div>

            </div>

            {/* Advanced Settings Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Hide Optional Protection' : 'Show Optional Protection (Password, Max Downloads)'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 animate-fade-in">

                  {/* Password Protection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      Optional Download Password
                    </label>
                    <input
                      type="password"
                      placeholder="Leave blank for no password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full glass-input rounded-xl px-3 py-2 text-sm placeholder:text-slate-600"
                    />
                  </div>

                  {/* Max Downloads Limit */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <DownloadCloud className="w-3.5 h-3.5 text-cyan-400" />
                      Max Download Count Limit
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 1 (auto-deletes after N downloads)"
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                      className="w-full glass-input rounded-xl px-3 py-2 text-sm placeholder:text-slate-600"
                    />
                  </div>

                </div>
              )}
            </div>

            {/* Action Submit Button */}
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-xl transition-all ${!selectedFile || isUploading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'btn-primary'
                }`}
            >
              <Upload className="w-5 h-5" />
              <span>{isUploading ? 'Uploading File...' : 'Generate File Code'}</span>
            </button>

          </form>
        </div>

        {/* RIGHT COLUMN: Code Search Card (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">

          <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/20">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-xl text-slate-100">Received a File Code?</h2>
                <p className="text-xs text-slate-400">Enter code to view and download file</p>
              </div>
            </div>

            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Enter 6-Digit File Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 7X9K2M"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    className="w-full glass-input rounded-2xl px-4 py-3.5 text-center font-mono font-bold text-xl tracking-widest focus:ring-2 focus:ring-purple-500 placeholder:text-slate-600 placeholder:font-normal placeholder:text-base placeholder:tracking-normal"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.01]"
              >
                <Search className="w-4 h-4" />
                <span>Lookup & Download</span>
              </button>
            </form>
          </div>

          {/* Features Info Box */}
          <div className="glass-card rounded-2xl p-6 space-y-4 text-xs text-slate-400 border border-slate-800">
            <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              How TempVault Works
            </h4>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                <span>Upload file & select an expiry window (up to 24 hours max).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                <span>Share the unique 6-digit code or QR code out-of-band with recipient.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                <span>Server background worker purges physical files & metadata automatically upon expiry.</span>
              </li>
            </ul>
          </div>

        </div>

      </div>

      {/* Upload Progress & Success Modal */}
      <UploadModal
        isUploading={isUploading}
        progress={uploadProgress}
        uploadResult={uploadResult}
        onClose={handleResetUpload}
        onToast={onToast}
      />

    </div>
  );
};

export default HomePage;
