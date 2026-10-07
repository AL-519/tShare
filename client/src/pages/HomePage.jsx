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
  Download,
  Sliders,
  HardDrive,
  Layers,
  Zap,
  Activity,
  CheckCircle2
} from 'lucide-react';
import { uploadFile } from '../services/api';
import { saveLocalFile } from '../services/db';
import { startTorrentSeederService } from '../services/torrentEngine';

export const HomePage = ({ onToast }) => {
  const navigate = useNavigate();

  // Upload Form State
  const [selectedFile, setSelectedFile] = useState(null);
  const [duration, setDuration] = useState('1h');
  const [password, setPassword] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Upload Progress & Modal State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);

  // Code Lookup State
  const [searchCode, setSearchCode] = useState('');

  // Start background torrent seeder service on mount
  useEffect(() => {
    startTorrentSeederService();
  }, []);

  // Update HTML document title and meta description for SEO
  useEffect(() => {
    document.title = 'TempVault — Peer-to-Peer File Transfer';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'Share files directly from your device with peer-to-peer transfer. No file size limits with configurable link expiration.'
      );
    }
  }, []);

  // Handle Form Submit
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      onToast('Please select a file to share.', 'error');
      return;
    }

    const PIECE_SIZE = 512 * 1024; // 512 KB per piece
    const totalPieces = Math.ceil(selectedFile.size / PIECE_SIZE);

    try {
      setIsUploading(true);
      setUploadProgress(20);

      // 1. Register file metadata on the server
      const result = await uploadFile({
        originalName: selectedFile.name,
        size: selectedFile.size,
        mimeType: selectedFile.type || 'application/octet-stream',
        duration,
        password: password.trim() || undefined,
        pieceSize: PIECE_SIZE,
        totalPieces,
      });

      setUploadProgress(60);

      // 2. Save file blob to browser IndexedDB so this device can immediately seed pieces
      await saveLocalFile(result.code, selectedFile, {
        originalName: selectedFile.name,
        mimeType: selectedFile.type,
        size: selectedFile.size,
        pieceSize: PIECE_SIZE,
        totalPieces,
        expiresAt: result.file?.expiresAt,
        creatorToken: result.creatorToken,
        isCreator: true,
      });

      setUploadProgress(100);
      setIsUploading(false);
      setUploadResult(result);
      onToast('File ready! Seeding from your device.', 'success');
    } catch (error) {
      console.error('[Upload ERROR]', error);
      setIsUploading(false);
      const msg = error.response?.data?.message || 'Failed to prepare file share. Please try again.';
      onToast(msg, 'error');
    }
  };

  const handleResetUpload = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setUploadProgress(0);
    setPassword('');
    setShowAdvanced(false);
  };

  // Handle Code Search Submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const cleanCode = searchCode.trim().toUpperCase();
    if (!cleanCode) {
      onToast('Please enter a 6-digit file code.', 'error');
      return;
    }
    navigate(`/download/${cleanCode}`);
  };

  // Computed chunk pieces for detailed mode preview
  const previewPieceCount = selectedFile ? Math.ceil(selectedFile.size / (512 * 1024)) : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">

      {/* Hero Header */}
      <section className="text-center max-w-3xl mx-auto mb-10 sm:mb-12 animate-fade-in" aria-labelledby="hero-heading">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold mb-4">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>peer-to-peer sharing</span>
        </div>
        <h1 id="hero-heading" className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-4 leading-tight">
          Share Files Privately.
        </h1>
        <p className="text-slate-400 text-base sm:text-lg">
          Files stay safely on your device and transfer directly to recipients. No size limits.
        </p>
      </section>

      {/* Main Grid: Upload Card & Code Search Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Upload Card (7 Cols) */}
        <section className="lg:col-span-7 glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/20" aria-labelledby="upload-heading">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h2 id="upload-heading" className="font-bold text-xl text-slate-100">
                  Share a File
                </h2>
                <p className="text-xs text-slate-400">
                  Select any file and set link expiration
                </p>
              </div>
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

            {/* Real-Time Torrent Piece Calculation Card */}
            {selectedFile && (
              <div className="p-3.5 rounded-2xl bg-cyan-950/20 border border-cyan-500/30 flex items-center justify-between text-xs animate-fade-in">
                <div className="flex items-center gap-2 text-cyan-300 font-medium">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span>Torrent Chunk Breakdown:</span>
                </div>
                <div className="font-mono text-slate-200">
                  <span className="text-cyan-400 font-bold">{Math.ceil(selectedFile.size / (512 * 1024))}</span> pieces × 512 KB
                </div>
              </div>
            )}

            {/* Link Expiry Option (Storage Destination removed) */}
            <div>
              <label htmlFor="expiry-duration-select" className="block text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Link expire time</span>
              </label>
              <select
                id="expiry-duration-select"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="w-full glass-input rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
              >
                <option value="10m" className="bg-slate-900 text-slate-200">10 Minutes</option>
                <option value="1h" className="bg-slate-900 text-slate-200">1 Hour</option>
                <option value="6h" className="bg-slate-900 text-slate-200">6 Hours</option>
                <option value="12h" className="bg-slate-900 text-slate-200">12 Hours</option>
                <option value="24h" className="bg-slate-900 text-slate-200">24 Hours</option>
                <option value="1w" className="bg-slate-900 text-slate-200">1 Week</option>
                <option value="1m" className="bg-slate-900 text-slate-200">1 Month</option>
                <option value="undefined" className="bg-slate-900 text-slate-200">Undefined (Never expires)</option>
              </select>
            </div>

            {/* Advanced Settings Toggle */}
            <div>
              <button
                type="button"
                id="toggle-protection-btn"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showAdvanced ? 'Hide Password Protection' : 'Optional Password Protection'}</span>
              </button>

              {showAdvanced && (
                <div className="mt-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 animate-fade-in">

                  {/* Password Protection */}
                  <div>
                    <label htmlFor="file-password-input" className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      Optional Password
                    </label>
                    <input
                      id="file-password-input"
                      type="password"
                      placeholder="Leave blank for no password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full glass-input rounded-xl px-3 py-2 text-sm placeholder:text-slate-600"
                    />
                  </div>

                </div>
              )}
            </div>

            {/* Action Submit Button */}
            <button
              type="submit"
              id="generate-code-btn"
              disabled={!selectedFile || isUploading}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-xl transition-all ${!selectedFile || isUploading
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'btn-primary'
                }`}
            >
              <Upload className="w-5 h-5" />
              <span>
                {isUploading
                  ? 'Preparing Local Share...'
                  : 'Start Seeding & Generate Share Code'}
              </span>
            </button>

          </form>
        </section>

        {/* RIGHT COLUMN: Code Search Card & Info (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">

          {/* Search Card */}
          <section className="glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/20" aria-labelledby="search-heading">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 id="search-heading" className="font-bold text-xl text-slate-100">Have a File Code?</h2>
                <p className="text-xs text-slate-400">Enter code to connect to the seeder</p>
              </div>
            </div>

            <form onSubmit={handleSearchSubmit} className="space-y-4">
              <div>
                <label htmlFor="search-code-input" className="block text-xs font-semibold text-slate-300 mb-2">
                  Enter 6-Character Code
                </label>
                <div className="relative">
                  <input
                    id="search-code-input"
                    type="text"
                    maxLength={10}
                    placeholder="e.g. 7X9K2M"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                    className="w-full glass-input rounded-2xl px-4 py-3.5 text-center font-mono font-bold text-xl tracking-widest focus:ring-2 focus:ring-purple-500 placeholder:text-slate-600 placeholder:font-normal placeholder:text-base placeholder:tracking-normal uppercase"
                  />
                </div>
              </div>

              <button
                type="submit"
                id="search-code-submit-btn"
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.01]"
              >
                <Search className="w-4 h-4" />
                <span>Retrieve File</span>
              </button>
            </form>
          </section>

          {/* Info Card: Normal vs Detailed Explanations */}
          <section className="glass-card rounded-2xl p-6 space-y-4 text-xs text-slate-400 border border-slate-800" aria-label="How it works">
            <h3 className="font-bold text-sm text-slate-200 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              How TempVault Swarm Works
            </h3>

            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                <span><strong>Direct Device Storage:</strong> Files are sliced into 512 KB chunks and held in browser IndexedDB on your device with zero server disk storage.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                <span><strong>Instant Peer Transfer:</strong> Share the 6-character code or link. The recipient directly downloads chunks from your device.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                <span><strong>Timed Expiration:</strong> When the configured timer hits zero, the link and metadata automatically expire.</span>
              </li>
            </ul>
          </section>

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
