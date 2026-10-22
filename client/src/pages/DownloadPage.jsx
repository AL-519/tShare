import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Download,
  Clock,
  Lock,
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  Zap,
  Layers,
  FolderDown,
  Trash2,
  ShieldAlert,
  Key,
  ShieldCheck,
} from 'lucide-react';
import { getFileMetadata, fetchSwarmStatus, deleteFile, unlockFile } from '../services/api';
import { getLocalFile, deleteLocalFile } from '../services/db';
import { downloadTorrentFile, startTorrentSeederService } from '../services/torrentEngine';
import { formatBytes } from '../components/Dropzone';
import { TorrentDetailsPanel } from '../components/TorrentDetailsPanel';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

export const DownloadPage = ({ onToast }) => {
  const { code } = useParams();
  const cleanCode = String(code || '').trim().toUpperCase();

  const [loading, setLoading] = useState(true);
  const [fileData, setFileData] = useState(null);
  const [errorState, setErrorState] = useState(null);

  // Swarm Metrics
  const [seedersCount, setSeedersCount] = useState(0);
  const [peersCount, setPeersCount] = useState(1);

  // Password & Folder Unlock State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlockToken, setUnlockToken] = useState(null);
  const [isFolderUnlocked, setIsFolderUnlocked] = useState(true);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  // Countdown Timer State
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: false });

  // Torrent Download Progress State
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [downloadSpeedBytes, setDownloadSpeedBytes] = useState(0);
  const [avgDownloadSpeedBytes, setAvgDownloadSpeedBytes] = useState(0);
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [piecesDownloaded, setPiecesDownloaded] = useState(0);
  const [bitfield, setBitfield] = useState([]);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [completedTimestamp, setCompletedTimestamp] = useState(null);
  const [downloadedBlob, setDownloadedBlob] = useState(null);
  const [downloadedBlobUrl, setDownloadedBlobUrl] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Timer trackers for Detailed view panel
  const [timeActiveSec, setTimeActiveSec] = useState(0);
  const [timeSeededSec, setTimeSeededSec] = useState(0);
  const [reannounceSec, setReannounceSec] = useState(5);

  // Check if file is already on this device's IndexedDB
  const [localFileRecord, setLocalFileRecord] = useState(null);

  // Active time ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeActiveSec((prev) => prev + 1);
      if (downloadComplete) {
        setTimeSeededSec((prev) => prev + 1);
      }
      setReannounceSec((prev) => (prev <= 1 ? 5 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [downloadComplete]);

  // Start background seeder service on mount
  useEffect(() => {
    startTorrentSeederService();
  }, []);

  // Fetch File Metadata & Check Local IndexedDB
  useEffect(() => {
    let isMounted = true;

    const fetchMetadata = async () => {
      try {
        setLoading(true);
        setErrorState(null);

        const data = await getFileMetadata(cleanCode, unlockToken);
        if (isMounted && data.success && data.file) {
          setFileData(data.file);
          setSeedersCount(data.file.seedersCount || 0);
          setIsFolderUnlocked(data.file.isUnlocked !== false && !data.file.isFolderLocked);

          // Update SEO document title dynamically
          document.title = `Download ${data.file.originalName} | TShare`;
        } else {
          if (isMounted) setErrorState({ error: 'not_found', message: 'File not found or link has expired.' });
        }
      } catch (err) {
        if (isMounted) {
          const resData = err.response?.data;
          const errorMsg = resData?.message || 'File is invalid, expired, or has reached its download limit.';
          const errorCode = resData?.error || (resData?.isExpired ? 'expired' : 'not_found');
          setErrorState({
            error: errorCode,
            message: errorMsg,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const CODE_REGEX = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4,12}$/i;
    if (!cleanCode || !CODE_REGEX.test(cleanCode)) {
      setLoading(false);
      setErrorState({
        error: 'invalid_code',
        message: 'Invalid file code format. Codes must be 4 to 12 alphanumeric characters.',
      });
      return;
    }

    if (cleanCode) {
      fetchMetadata();
      getLocalFile(cleanCode).then((rec) => {
        if (isMounted && rec && rec.blob) {
          setLocalFileRecord(rec);
          setDownloadedBlob(rec.blob);
          setDownloadedBlobUrl(URL.createObjectURL(rec.blob));
          setDownloadComplete(true);
          setDownloadProgress(100);
          setBytesDownloaded(rec.size || 0);
          setPiecesDownloaded(rec.totalPieces || Math.ceil((rec.size || 1) / (512 * 1024)));
          setCompletedTimestamp(rec.createdAt || Date.now());
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, [cleanCode]);

  // Periodic Swarm Status Polling (every 5 seconds) to update seeder count
  useEffect(() => {
    if (!cleanCode || errorState) return;

    const pollSwarm = async () => {
      try {
        const res = await fetchSwarmStatus(cleanCode);
        if (res.success) {
          setSeedersCount(res.seedersCount || 0);
          setPeersCount(Math.max(1, (res.seedersCount || 0) + (downloadComplete ? 0 : 1)));
        }
      } catch (e) {
        // Silent catch for background poll
      }
    };

    const interval = setInterval(pollSwarm, 5000);
    return () => clearInterval(interval);
  }, [cleanCode, downloadComplete, errorState]);

  // Expiry Countdown Calculator
  useEffect(() => {
    if (!fileData?.expiresAt) return;

    const calculateTimeLeft = () => {
      const diff = new Date(fileData.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft({ days, hours, minutes, seconds, isExpired: false });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [fileData?.expiresAt]);

  // Allow user to select folder/location to store file via File System Access API
  const saveBlobToSelectedLocation = async (blob, filename, mimeType) => {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const ext = filename && filename.lastIndexOf('.') !== -1 ? filename.slice(filename.lastIndexOf('.')) : '';
        const pickerOptions = {
          suggestedName: filename || 'downloaded_file',
        };
        if (ext) {
          pickerOptions.types = [
            {
              description: 'File',
              accept: { [mimeType || 'application/octet-stream']: [ext] },
            },
          ];
        }
        const handle = await window.showSaveFilePicker(pickerOptions);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { success: true, method: 'picker', name: handle.name || filename };
      } catch (err) {
        if (err.name === 'AbortError') {
          // User intentionally closed/cancelled the picker dialog
          return { success: false, cancelled: true };
        }
        console.warn('showSaveFilePicker error, falling back to browser download:', err);
      }
    }

    // Fallback: standard browser download to default downloads folder
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename || 'downloaded_file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    return { success: true, method: 'fallback', name: filename };
  };

  const triggerDirectBrowserDownload = (urlOrBlob, filename) => {
    const isBlob = urlOrBlob instanceof Blob;
    const url = isBlob ? URL.createObjectURL(urlOrBlob) : urlOrBlob;
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 15000);
  };

  // Handle Password-Protected Folder Unlock
  const handleUnlockFolder = async (e) => {
    if (e) e.preventDefault();
    if (!password.trim()) {
      setUnlockError('Please enter the security password to unlock the folder.');
      return;
    }

    try {
      setIsUnlocking(true);
      setUnlockError('');
      const res = await unlockFile(cleanCode, password.trim());
      if (res.success && res.file) {
        setUnlockToken(res.unlockToken);
        setFileData(res.file);
        setIsFolderUnlocked(true);
        onToast('Folder unlocked successfully! Access granted.', 'success');
        document.title = `Download ${res.file.originalName} | TShare`;
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Incorrect password. Folder remains locked.';
      setUnlockError(msg);
      onToast(msg, 'error');
    } finally {
      setIsUnlocking(false);
    }
  };

  // Handle Torrent Piece-by-Piece Download & Assembly with Location Selection
  const handleDownload = async (actionType = 'picker') => {
    const filename = fileData?.originalName || 'file';
    const mimeType = fileData?.mimeType || 'application/octet-stream';

    // 1. If already saved in local IndexedDB or active memory
    if (downloadedBlob || downloadedBlobUrl) {
      if (actionType === 'inline') {
        const targetUrl = downloadedBlobUrl || (downloadedBlob ? URL.createObjectURL(downloadedBlob) : null);
        if (targetUrl) window.open(targetUrl, '_blank');
        return;
      }

      if (actionType === 'picker' && downloadedBlob) {
        const res = await saveBlobToSelectedLocation(downloadedBlob, filename, mimeType);
        if (res.success) {
          onToast(
            res.method === 'picker'
              ? `Saved '${res.name}' to selected folder!`
              : 'File downloaded successfully!',
            'success'
          );
        }
        return;
      }

      // Quick download directly to Downloads folder
      triggerDirectBrowserDownload(downloadedBlob || downloadedBlobUrl, filename);
      onToast('File saved to default Downloads folder!', 'success');
      return;
    }

    // 2. Validate folder unlock requirement
    if (fileData?.isPasswordProtected && !isFolderUnlocked) {
      onToast('Please enter the password to unlock the folder first.', 'error');
      return;
    }

    // 3. Check seeder availability
    if (seedersCount === 0) {
      onToast('No active seeders online right now. Waiting for seeder to connect...', 'error');
    }

    try {
      setIsDownloading(true);
      setIsVerifying(false);
      setDownloadProgress(0);
      setPiecesDownloaded(0);

      const blob = await downloadTorrentFile(cleanCode, fileData, {
        password: password.trim(),
        unlockToken,
        onProgress: ({ percent, piecesReceived, totalPieces, bytesReceived, speedBytesPerSec, bitfield: updatedBitfield, isVerifying: verifying, status: progressStatus }) => {
          if (verifying || progressStatus === 'verifying') {
            setIsVerifying(true);
            setDownloadProgress(100);
          } else {
            setDownloadProgress(percent);
          }
          setPiecesDownloaded(piecesReceived);
          setBytesDownloaded(bytesReceived);
          setBitfield(updatedBitfield);
          setDownloadSpeedBytes(speedBytesPerSec);
          setAvgDownloadSpeedBytes((prev) => Math.round((prev + speedBytesPerSec) / 2));
        },
      });

      const objectUrl = URL.createObjectURL(blob);
      setDownloadedBlob(blob);
      setDownloadedBlobUrl(objectUrl);
      setDownloadComplete(true);
      setCompletedTimestamp(Date.now());
      setIsDownloading(false);
      setIsVerifying(false);
      setDownloadProgress(100);

      // Perform user's requested action
      if (actionType === 'inline') {
        window.open(objectUrl, '_blank');
        onToast('File loaded and verified successfully!', 'success');
      } else if (actionType === 'picker') {
        const res = await saveBlobToSelectedLocation(blob, filename, mimeType);
        if (res.success) {
          onToast(
            res.method === 'picker'
              ? `Saved '${res.name}' to selected folder!`
              : 'File downloaded successfully!',
            'success'
          );
        }
      } else {
        triggerDirectBrowserDownload(blob, filename);
        onToast('File downloaded and verified successfully!', 'success');
      }
    } catch (err) {
      console.error('[Download ERROR]', err);
      setIsDownloading(false);
      setIsVerifying(false);
      onToast(err.message || 'Download failed. Ensure a seeder is online.', 'error');
    }
  };

  // Dual delete handler: delete file & entry, or delete entry keeping file
  const handleConfirmDelete = async (code, mode) => {
    try {
      setIsDeleteModalOpen(false);
      let remoteDeleted = false;

      try {
        await deleteFile(code);
        remoteDeleted = true;
      } catch (err) {
        // If current user didn't upload it, deleteFile returns 403 on server,
        // but user can still delete local file from their device
        if (err.response?.status !== 403) {
          throw err;
        }
      }

      if (mode === 'full') {
        await deleteLocalFile(code);
        setDownloadedBlob(null);
        setDownloadedBlobUrl(null);
        setLocalFileRecord(null);
        onToast(
          remoteDeleted
            ? `File and share link permanently deleted.`
            : `Local file removed from your device storage.`,
          'success'
        );
      } else {
        onToast(`Removed from list and deactivated link. File kept safely on this device.`, 'info');
      }

      if (remoteDeleted) {
        setErrorState('This file has been deleted and the share link deactivated.');
      }
    } catch (err) {
      onToast(err.response?.data?.message || 'Failed to delete file.', 'error');
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

  // ERROR STATE (File Expired / Invalid Code / Deleted / Limit)
  if (errorState || (fileData?.expiresAt && timeLeft.isExpired)) {
    const errorObj = typeof errorState === 'object' && errorState !== null ? errorState : { message: errorState || '' };
    const errorCode = (fileData?.expiresAt && timeLeft.isExpired) ? 'expired' : (errorObj.error || errorObj.code || '');
    const errorMsg = (fileData?.expiresAt && timeLeft.isExpired)
      ? 'This file link has expired and is no longer available.'
      : (errorObj.message || 'This file is currently unavailable.');

    const isExpired = errorCode === 'expired' || errorMsg.toLowerCase().includes('expire');
    const isDeleted = errorCode === 'deleted' || errorMsg.toLowerCase().includes('delete') || errorMsg.toLowerCase().includes('revok');
    const isLimit = errorCode === 'max_downloads_reached' || errorMsg.toLowerCase().includes('limit');
    const isNotFound = errorCode === 'not_found' || (!isExpired && !isDeleted && !isLimit);

    return (
      <div className="max-w-xl mx-auto px-4 py-16 animate-fade-in">
        <div className={`glass-panel rounded-3xl p-8 sm:p-10 text-center border shadow-2xl ${
          isExpired
            ? 'border-amber-500/30'
            : isDeleted
            ? 'border-rose-500/30'
            : isLimit
            ? 'border-orange-500/30'
            : 'border-indigo-500/30'
        }`}>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${
            isExpired
              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400'
              : isDeleted
              ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400'
              : isLimit
              ? 'bg-orange-500/10 border border-orange-500/20 text-orange-500 dark:text-orange-400'
              : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400'
          }`}>
            {isExpired && <Clock className="w-8 h-8" />}
            {isDeleted && <Trash2 className="w-8 h-8" />}
            {isLimit && <AlertTriangle className="w-8 h-8" />}
            {isNotFound && <AlertTriangle className="w-8 h-8" />}
          </div>

          <h2 className="font-extrabold text-2xl text-slate-900 dark:text-slate-100 mb-2">
            {isExpired && 'Link Expired'}
            {isDeleted && 'File Share Revoked'}
            {isLimit && 'Download Limit Reached'}
            {isNotFound && 'File Code Not Found'}
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 max-w-sm mx-auto leading-relaxed">
            {errorMsg}
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Home</span>
            </Link>

            <Link
              to="/downloads"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Go to Downloads</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const totalPiecesCount = fileData?.totalPieces || Math.ceil((fileData?.size || 1) / (fileData?.pieceSize || 512 * 1024));

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 animate-fade-in transition-all duration-300">
      
      {/* Top Back Nav & Delete Option */}
      <div className="flex items-center justify-between mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>

        {localFileRecord && (
          <button
            id="download-page-delete-btn"
            onClick={() => setIsDeleteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
            title="Choose deletion options"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete File...</span>
          </button>
        )}
      </div>

      <div className="glass-panel rounded-3xl p-6 sm:p-10 shadow-2xl border border-indigo-500/30 relative overflow-hidden space-y-6">
        
        {/* Background glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/10 dark:bg-purple-600/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Header Badges */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-mono font-bold">
            <span>CODE:</span>
            <span className="text-slate-900 dark:text-white tracking-widest">{cleanCode}</span>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            {fileData.isPasswordProtected && (
              !isFolderUnlocked ? (
                <span className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Folder Locked</span>
                </span>
              ) : (
                <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Folder Unlocked</span>
                </span>
              )
            )}

            {seedersCount > 0 ? (
              <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{seedersCount} Seeder{seedersCount > 1 ? 's' : ''} Online</span>
              </span>
            ) : (
              <span className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Connecting to Seeders...</span>
              </span>
            )}
          </div>
        </div>

        {/* LOCKED FOLDER INTERACTION CARD */}
        {fileData.isPasswordProtected && !isFolderUnlocked ? (
          <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-slate-900/60 border border-amber-500/30 text-center space-y-5 animate-fade-in">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <Lock className="w-8 h-8 animate-pulse" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold mb-2">
                <span>Password-Protected Folder Container</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-slate-100">
                Folder is Locked
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1">
                The uploader has locked this file inside a password-protected folder. Enter the security password to unlock the folder and access the file.
              </p>
            </div>

            <form onSubmit={handleUnlockFolder} className="max-w-md mx-auto space-y-4">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="folder-unlock-password-input"
                  placeholder="Enter security password to open folder"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (unlockError) setUnlockError('');
                  }}
                  className="w-full glass-input rounded-xl px-4 py-3.5 text-sm pr-11 border-amber-500/30 focus:border-amber-400"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {unlockError && (
                <p className="text-xs text-rose-400 font-semibold bg-rose-950/30 border border-rose-500/30 py-2 px-3 rounded-lg text-left flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{unlockError}</span>
                </p>
              )}

              <button
                type="submit"
                id="folder-unlock-submit-btn"
                disabled={isUnlocking || !password.trim()}
                className="w-full py-3.5 px-6 rounded-xl btn-primary font-bold text-sm flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 cursor-pointer"
              >
                <Key className="w-4 h-4" />
                <span>{isUnlocking ? 'Verifying Password...' : 'Unlock Folder & Reveal File'}</span>
              </button>
            </form>
          </div>
        ) : (
          <>
            {/* File Name & Main Details */}
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 break-all">
                  {fileData.originalName}
                </h1>
                {fileData.fileHash && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono flex items-center gap-1 font-semibold" title={`SHA-256: ${fileData.fileHash}`}>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>SHA-256 Verified</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                File Size: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatBytes(fileData.size)}</span>
                {' '}• <span className="font-mono text-cyan-600 dark:text-cyan-400">{totalPiecesCount} Pieces</span> • <span className="font-mono text-slate-600 dark:text-slate-300">512 KB/chunk</span>
              </p>
            </div>

            {/* High-Risk Executable File Warning Alert */}
            {/\.(exe|bat|cmd|msi|ps1|vbs|scr|iso|jar)$/i.test(fileData.originalName) && (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 dark:bg-rose-950/25 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300 animate-fade-in">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">⚠️ Executable File Alert: Potential Security Risk</span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
                    This file is an executable application ({fileData.originalName.split('.').pop().toUpperCase()}). Executable files can run commands on your device. Only open this file if you personally know and trust the sender.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* LIVE COUNTDOWN TIMER CARD */}
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/90 to-slate-100/90 dark:from-indigo-950/60 dark:to-slate-900/80 border border-indigo-200 dark:border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-slate-800 dark:text-slate-200">Link expire time</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {fileData.expiresAt ? 'Link expires when timer hits zero' : 'Permanent link (Never expires)'}
              </p>
            </div>
          </div>

          {fileData.expiresAt ? (
            <div className="flex items-center gap-2 font-mono text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 bg-white dark:bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              {timeLeft.days > 0 && <span>{timeLeft.days}d </span>}
              <span>{String(timeLeft.hours).padStart(2, '0')}h</span>
              <span>:</span>
              <span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
              <span>:</span>
              <span>{String(timeLeft.seconds).padStart(2, '0')}s</span>
            </div>
          ) : (
            <div className="font-mono text-sm sm:text-base font-bold text-emerald-600 dark:text-emerald-400 bg-white dark:bg-slate-950/60 px-4 py-2 rounded-xl border border-emerald-500/30 shadow-xs">
              Never Expires
            </div>
          )}
        </div>

        {/* Active Transfer Progress Bar */}
        {isDownloading && (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-indigo-500/40 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span className="font-semibold flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isVerifying ? 'bg-indigo-500 animate-pulse' : 'bg-cyan-500 dark:bg-cyan-400 animate-ping'}`}></span>
                <span>{isVerifying ? 'Verifying all packets & integrity...' : 'Downloading file directly from peer device...'}</span>
              </span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">
                {isVerifying ? 'Verifying 100%' : `${downloadProgress}%`}
              </span>
            </div>

            <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-300 dark:border-slate-700">
              <div
                className={`h-full ${isVerifying ? 'bg-indigo-500 animate-pulse' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400'} rounded-full transition-all duration-300`}
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Transfer & Swarm Telemetry Panel */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4" /> Transfer & Swarm Diagnostics
            </span>
          </div>

          <TorrentDetailsPanel
            fileData={fileData}
            progress={downloadComplete ? 100 : downloadProgress}
            downloadSpeed={downloadSpeedBytes}
            averageDownloadSpeed={avgDownloadSpeedBytes}
            uploadSpeed={0}
            averageUploadSpeed={0}
            bytesDownloaded={downloadComplete ? (fileData.size || 0) : bytesDownloaded}
            bytesUploaded={0}
            piecesHave={downloadComplete ? totalPiecesCount : piecesDownloaded}
            totalPieces={totalPiecesCount}
            pieceSize={fileData.pieceSize || 512 * 1024}
            seedersCount={seedersCount}
            peersCount={peersCount}
            timeActiveSec={timeActiveSec}
            timeSeededSec={timeSeededSec}
            reannounceSec={reannounceSec}
            completedOn={completedTimestamp}
            wastedBytes={0}
            bitfield={bitfield}
            showPieceMap={true}
          />
        </div>

        {/* ALREADY DOWNLOADED / SEEDING ACTIVE BADGE */}
        {downloadComplete && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 dark:bg-emerald-950/25 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <span>File complete & cached in browser IndexedDB. Your device is now actively seeding to the swarm.</span>
          </div>
        )}

        {/* Safety Notice & Source Verification */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/20 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block">Caution: Verify you know and trust the sender.</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
              Files transfer directly peer-to-peer and are not scanned by the server. Always scan downloads with an antivirus.{' '}
              <Link to="/guidelines" className="text-amber-600 dark:text-amber-400 underline font-medium hover:text-amber-500">
                Safety Guidelines & Disclaimer
              </Link>
            </span>
          </div>
        </div>

        {/* ACTION BUTTONS (Only Available When Folder is Unlocked) */}
        {isFolderUnlocked ? (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Primary: Save to Selected Location via Native File Picker */}
              <button
                id="download-location-btn"
                onClick={() => handleDownload('picker')}
                disabled={isDownloading}
                className="py-4 px-5 rounded-2xl btn-primary font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-xl transition-all disabled:opacity-50 cursor-pointer"
                title="Select folder on your computer where the file will be saved"
              >
                <FolderDown className="w-5 h-5" />
                <span>{isDownloading ? (isVerifying ? 'Verifying Integrity...' : 'Receiving Pieces...') : 'Choose Location to Save...'}</span>
              </button>

              {/* Secondary: Quick Download to Default Downloads Directory */}
              <button
                id="download-quick-btn"
                onClick={() => handleDownload('quick')}
                disabled={isDownloading}
                className="py-4 px-5 rounded-2xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                title="Save directly to default browser downloads folder"
              >
                <Download className="w-5 h-5" />
                <span>Quick Download</span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Preview: Open in Tab */}
              <button
                id="download-preview-btn"
                onClick={() => handleDownload('inline')}
                disabled={isDownloading}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.01] disabled:opacity-50 cursor-pointer shadow-xs"
                title="Open file in a new browser tab"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Tab</span>
              </button>

              {/* Delete button if file exists locally */}
              {localFileRecord && (
                <button
                  id="download-action-delete-btn"
                  onClick={() => setIsDeleteModalOpen(true)}
                  disabled={isDownloading}
                  className="py-3 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-500/30 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  title="Choose deletion options"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete...</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
            <Lock className="w-4 h-4 text-amber-500" />
            <span>Enter the security password in the folder card above to access download actions.</span>
          </div>
        )}

        {/* Stats footer */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-500 pt-4 border-t border-slate-200 dark:border-slate-800">
          <span>Uploaded: {new Date(fileData.createdAt).toLocaleDateString()}</span>
          <span>Downloads: {fileData.downloadCount}</span>
        </div>

      </div>

      {/* DUAL DELETE CONFIRMATION MODAL */}
      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        file={fileData ? { ...fileData, code: cleanCode } : null}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};

export default DownloadPage;
