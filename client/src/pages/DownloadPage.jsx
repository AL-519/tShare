import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Download, 
  Clock, 
  Lock, 
  FileText, 
  AlertTriangle, 
  ArrowLeft, 
  CheckCircle2, 
  ShieldCheck, 
  HardDrive, 
  Cloud,
  Eye,
  EyeOff,
  ExternalLink
} from 'lucide-react';
import { getFileMetadata, getDownloadUrl } from '../services/api';
import { getLocalFile } from '../services/db';
import { formatBytes } from '../components/Dropzone';

export const DownloadPage = ({ onToast }) => {
  const { code } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [fileData, setFileData] = useState(null);
  const [errorState, setErrorState] = useState(null);

  // Password State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Countdown Timer State
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0, isExpired: false });

  const [localFileRecord, setLocalFileRecord] = useState(null);

  // Fetch File Metadata & check IndexedDB eagerly
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        setLoading(true);
        setErrorState(null);
        console.log(`[DownloadPage] Fetching metadata for file code '${code}'...`);
        const data = await getFileMetadata(code);
        console.log('[DownloadPage] Metadata response:', data);
        if (data.success && data.file) {
          setFileData(data.file);
        } else {
          setErrorState('File code not found or expired.');
        }
      } catch (err) {
        console.error('[DownloadPage ERROR] Metadata fetch failed:', err.response?.data || err.message || err);
        const errorMsg = err.response?.data?.message || 'File code is invalid, expired, or has reached maximum download limit.';
        setErrorState(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    if (code) {
      fetchMetadata();
      console.log(`[DownloadPage] Checking browser IndexedDB eagerly for code '${code}'...`);
      getLocalFile(code).then((rec) => {
        if (rec && rec.blob) {
          console.log(`[DownloadPage SUCCESS] Found file blob in local IndexedDB for '${code}'. Size: ${rec.blob.size} bytes.`);
          setLocalFileRecord(rec);
        } else {
          console.log(`[DownloadPage INFO] File code '${code}' is NOT stored in current browser IndexedDB. Will use peer stream relay or cloud download.`);
        }
      });
    }
  }, [code]);

  // Ticking Countdown Timer Effect
  useEffect(() => {
    if (!fileData?.expiresAt) return;

    const calculateTimeLeft = () => {
      const difference = new Date(fileData.expiresAt).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const hours = Math.floor(difference / (1000 * 60 * 60));
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({ hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [fileData?.expiresAt]);

  // Handle Action (Open in New Tab or Direct Download)
  const handleFileAction = (isInline = false) => {
    console.log(`[DownloadPage ACTION] User clicked ${isInline ? 'Open / Play in New Tab' : 'Save / Download'} for code '${code}'`);

    if (fileData?.isPasswordProtected && !password) {
      onToast('Please enter the required password first.', 'error');
      return;
    }

    // 1. Direct download/preview from local IndexedDB if present on uploader device
    if (localFileRecord && localFileRecord.blob) {
      console.log(`[DownloadPage ACTION] Serving directly from browser IndexedDB. Blob size: ${localFileRecord.blob.size} bytes.`);
      const objectUrl = URL.createObjectURL(localFileRecord.blob);
      if (isInline) {
        const win = window.open(objectUrl, '_blank');
        if (!win) window.location.href = objectUrl;
        onToast('Opening file directly from your device storage...', 'info');
      } else {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileData?.originalName || localFileRecord.name || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        onToast('Downloaded directly from your device storage!', 'success');
      }
      return;
    }

    // 2. Peer stream or CDN download for recipient devices
    const downloadEndpoint = getDownloadUrl(code, password, isInline);
    console.log(`[DownloadPage ACTION] Serving via server download endpoint: '${downloadEndpoint}' (storageProvider: ${fileData?.storageProvider})`);

    if (isInline) {
      const win = window.open(downloadEndpoint, '_blank');
      if (!win) window.location.href = downloadEndpoint;
      onToast('Opening file preview in new tab...', 'info');
    } else {
      // Direct attachment download without tab replacement
      window.location.href = downloadEndpoint;
      onToast('File download started!', 'success');
    }
  };

  // LOADING STATE
  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="glass-panel rounded-3xl p-8 border border-indigo-500/20 space-y-4 animate-pulse">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 mx-auto"></div>
          <div className="h-6 bg-slate-800 rounded-lg w-3/4 mx-auto"></div>
          <div className="h-4 bg-slate-800/60 rounded-lg w-1/2 mx-auto"></div>
          <div className="h-12 bg-slate-800 rounded-xl w-full"></div>
        </div>
      </div>
    );
  }

  // ERROR STATE (File Expired / Invalid Code)
  if (errorState || timeLeft.isExpired) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 animate-fade-in">
        <div className="glass-panel rounded-3xl p-8 text-center border border-rose-500/30 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <h2 className="font-extrabold text-2xl text-slate-100 mb-2">
            File Unavailable or Expired
          </h2>
          <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">
            {errorState || 'This file link has expired and has been permanently purged from our servers.'}
          </p>

          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home Page</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 animate-fade-in">
      
      {/* Top Back Nav */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-indigo-400 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Home</span>
      </Link>

      <div className="glass-panel rounded-3xl p-6 sm:p-10 shadow-2xl border border-indigo-500/30 relative overflow-hidden">
        
        {/* Background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Badge */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-mono font-bold">
            <span>CODE:</span>
            <span className="text-white tracking-widest">{code}</span>
          </div>

          <span className="text-xs px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1">
            {fileData.storageProvider === 'imagekit' ? (
              <Cloud className="w-3.5 h-3.5 text-purple-400" />
            ) : (
              <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span className="capitalize">{fileData.storageProvider} Storage</span>
          </span>
        </div>

        {/* File Name & Main Details */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 break-all mb-2">
            {fileData.originalName}
          </h1>
          <p className="text-sm text-slate-400">
            File Size: <span className="font-semibold text-slate-200">{formatBytes(fileData.size)}</span> • Type: <span className="font-mono text-slate-300">{fileData.mimeType}</span>
          </p>
        </div>

        {/* LIVE COUNTDOWN TIMER CARD */}
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 to-slate-900/80 border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-slate-200">Self-Destruct Countdown</h3>
              <p className="text-xs text-slate-400">File purges when timer hits zero</p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xl sm:text-2xl font-bold text-amber-400 bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800">
            <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
            <span>:</span>
            <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
            <span>:</span>
            <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
          </div>
        </div>

        {/* PASSWORD INPUT IF PROTECTED */}
        {fileData.isPasswordProtected && (
          <div className="mb-8 p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30">
            <label className="block text-xs font-bold text-amber-300 mb-2 flex items-center gap-1.5">
              <Lock className="w-4 h-4 text-amber-400" />
              Password Protected File
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter password to unlock download"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full glass-input rounded-xl px-4 py-3 text-sm pr-10 border-amber-500/30 focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => handleFileAction(true)}
            className="flex-1 py-4 rounded-2xl btn-primary font-bold text-base flex items-center justify-center gap-2.5 shadow-xl"
            title="Open document, preview image/pdf, or play audio/video in a new browser tab"
          >
            <ExternalLink className="w-5 h-5" />
            <span>Open / Play in New Tab</span>
          </button>

          <button
            onClick={() => handleFileAction(false)}
            className="py-4 px-6 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-base flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
            title="Save file directly to your device"
          >
            <Download className="w-5 h-5" />
            <span>Save / Download</span>
          </button>
        </div>

        {/* Stats footer */}
        <div className="mt-6 flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800">
          <span>Uploaded: {new Date(fileData.createdAt).toLocaleDateString()}</span>
          <span>Downloads: {fileData.downloadCount} {fileData.maxDownloads ? `/ ${fileData.maxDownloads} max` : ''}</span>
        </div>

      </div>
    </div>
  );
};

export default DownloadPage;
