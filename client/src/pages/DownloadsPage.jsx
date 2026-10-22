import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  FolderDown,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Layers,
  MoreVertical,
  ExternalLink,
  Copy,
  Check,
  HardDrive,
  Clock,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Lock,
  Eye,
  EyeOff,
  Shield,
  Zap,
  UploadCloud
} from 'lucide-react';
import { getAllLocalFiles, deleteLocalFile, getLocalFile } from '../services/db';
import { getFileMetadata } from '../services/api';
import { downloadTorrentFile, startTorrentSeederService, isUploadAllowed, setUploadAllowed } from '../services/torrentEngine';
import { formatBytes } from '../components/Dropzone';

export const DownloadsPage = ({ onToast }) => {
  // Local device downloads from IndexedDB
  const [downloadedFiles, setDownloadedFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active downloads queue state
  const [downloadQueue, setDownloadQueue] = useState([]); // [{ id, code, status, progress, speed, error, fileName, size, pieceSize, totalPieces, bitfield, mimeType, createdAt, isPaused }]

  // Checkbox-selected item IDs (Set of queue item id or completed record code)
  const [selectedIds, setSelectedIds] = useState(new Set());
  const pausedItemIdsRef = useRef(new Set());
  const [uploadStateRev, setUploadStateRev] = useState(0);

  // Toggle allowing or stopping upload/seeding for a specific file
  const handleToggleUpload = (code, fileName) => {
    const currentlyAllowed = isUploadAllowed(code);
    setUploadAllowed(code, !currentlyAllowed);
    setUploadStateRev((prev) => prev + 1);
    if (currentlyAllowed) {
      onToast(`Upload stopped for '${fileName || code}'. Seeding paused.`, 'info');
    } else {
      onToast(`Upload allowed for '${fileName || code}'. Seeding resumed.`, 'success');
    }
  };

  // Add Download Modal/Card state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [inputPassword, setInputPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Selected file ID/code for details displayed in the bottom 40% panel
  const [selectedDetailId, setSelectedDetailId] = useState(null);

  // Right-click context menu state: { x, y, item, isQueueItem }
  const [contextMenu, setContextMenu] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  // Concurrency limiter constants and refs
  const MAX_CONCURRENT_DOWNLOADS = 3;
  const activeDownloadIdsRef = useRef(new Set());
  const abortControllersRef = useRef(new Map());

  // Load saved files from browser IndexedDB
  const loadLocalDownloads = async () => {
    try {
      setLoading(true);
      const records = await getAllLocalFiles();
      // Sort newest first
      records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setDownloadedFiles(records);
    } catch (err) {
      console.error('[DownloadsPage] Error loading local downloads:', err);
      onToast('Failed to load local downloads.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLocalDownloads();
    startTorrentSeederService();
    document.title = 'Downloads | TShare Peer-to-Peer Transfer';

    const handleOutsideClick = () => {
      setContextMenu(null);
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
        setIsAddModalOpen(false);
      }
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Save blob to user disk via browser download trigger
  const handleSaveToDisk = (record) => {
    if (!record || !record.blob) {
      onToast('File data is missing or corrupted.', 'error');
      return;
    }
    const blobUrl = URL.createObjectURL(record.blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = record.name || `download_${record.code}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    onToast(`Saving '${record.name}' to your device.`, 'success');
  };

  // Delete local file from IndexedDB
  const handleDeleteLocal = async (code, fileName) => {
    try {
      setContextMenu(null);
      await deleteLocalFile(code);
      setDownloadedFiles((prev) => prev.filter((f) => f.code !== code));
      setDownloadQueue((prev) => prev.filter((f) => f.code !== code));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      if (selectedDetailId === code) {
        setSelectedDetailId(null);
      }
      onToast(`'${fileName || code}' removed from local storage.`, 'info');
    } catch (err) {
      onToast('Failed to delete file from device storage.', 'error');
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    onToast(`File code '${code}' copied to clipboard.`, 'success');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // ETA Calculation Helper
  const formatETA = (item) => {
    if (item.status === 'completed' || (!item.status && item.code)) return 'Done';
    if (item.status === 'verifying') return 'Checking';
    if (item.isPaused) return 'Paused';
    if (item.status === 'queued') return 'Waiting';
    if (item.status === 'error') return '-';
    if (!item.speed || item.speed <= 0) return '∞';
    const remainingBytes = Math.max(0, (item.size || 0) * (1 - (item.progress || 0) / 100));
    const seconds = Math.ceil(remainingBytes / item.speed);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  // Download Speed Helper
  const formatDownloadSpeed = (item) => {
    if (item.status === 'verifying') return 'Verifying';
    if (item.status === 'downloading' && !item.isPaused) {
      return `${formatBytes(item.speed || 0)}/s`;
    }
    if (item.status === 'completed' || (!item.status && item.code)) return '-';
    if (item.isPaused) return '0 B/s';
    return '-';
  };

  // Upload Speed Helper
  const formatUploadSpeed = (item) => {
    if (item.status === 'completed' || (!item.status && item.code)) {
      return isUploadAllowed(item.code) ? 'Seeding' : 'Stopped';
    }
    return '-';
  };

  // Right-click context menu opener
  const handleRowContextMenu = (e, item, isQueueItem) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setContextMenu({ x, y, item, isQueueItem });
  };

  // Toggle single item selection checkbox
  const handleToggleSelectItem = (key) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 1. Pause Selected Downloads
  const handlePauseSelected = () => {
    if (selectedIds.size === 0) {
      onToast('Select one or more items using the checkboxes to pause.', 'info');
      return;
    }
    let pausedCount = 0;
    setDownloadQueue((prev) =>
      prev.map((q) => {
        if (selectedIds.has(q.id) && (q.status === 'downloading' || q.status === 'queued') && !q.isPaused) {
          pausedItemIdsRef.current.add(q.id);
          pausedCount++;
          return { ...q, isPaused: true, speed: 0 };
        }
        return q;
      })
    );
    if (pausedCount > 0) {
      onToast(`Paused ${pausedCount} selected download(s).`, 'info');
    } else {
      onToast('None of the selected items are currently downloading or queued.', 'info');
    }
  };

  // 2. Continue Selected Downloads
  const handleContinueSelected = () => {
    if (selectedIds.size === 0) {
      onToast('Select one or more items using the checkboxes to continue.', 'info');
      return;
    }
    let resumedCount = 0;
    setDownloadQueue((prev) =>
      prev.map((q) => {
        if (selectedIds.has(q.id) && q.isPaused) {
          pausedItemIdsRef.current.delete(q.id);
          resumedCount++;
          return { ...q, isPaused: false };
        }
        return q;
      })
    );
    if (resumedCount > 0) {
      onToast(`Resumed ${resumedCount} selected download(s).`, 'success');
    } else {
      onToast('None of the selected items are currently paused.', 'info');
    }
  };

  // 3. Delete Selected Downloads (from active queue and device storage)
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) {
      onToast('Select one or more items using the checkboxes to delete.', 'info');
      return;
    }

    let deletedQueueCount = 0;
    let deletedLocalCount = 0;

    // 1. Cancel and remove matching queue items
    const queueIdsToDelete = new Set();
    downloadQueue.forEach((q) => {
      if (selectedIds.has(q.id)) {
        queueIdsToDelete.add(q.id);
        if (abortControllersRef.current.has(q.id)) {
          abortControllersRef.current.get(q.id).abort();
          abortControllersRef.current.delete(q.id);
        }
        activeDownloadIdsRef.current.delete(q.id);
        pausedItemIdsRef.current.delete(q.id);
        deletedQueueCount++;
      }
    });

    if (queueIdsToDelete.size > 0) {
      setDownloadQueue((prev) => prev.filter((q) => !queueIdsToDelete.has(q.id)));
    }

    // 2. Delete matching completed items from IndexedDB
    const completedCodesToDelete = downloadedFiles
      .filter((f) => selectedIds.has(f.code))
      .map((f) => f.code);

    for (const code of completedCodesToDelete) {
      try {
        await deleteLocalFile(code);
        deletedLocalCount++;
      } catch (err) {
        console.warn(`[DownloadsPage] Could not delete ${code}:`, err);
      }
    }

    if (completedCodesToDelete.length > 0) {
      setDownloadedFiles((prev) => prev.filter((f) => !selectedIds.has(f.code)));
    }

    // 3. Clear deleted IDs from selectedIds
    setSelectedIds((prev) => {
      const next = new Set(prev);
      queueIdsToDelete.forEach((id) => next.delete(id));
      completedCodesToDelete.forEach((c) => next.delete(c));
      return next;
    });

    const totalDeleted = deletedQueueCount + deletedLocalCount;
    if (totalDeleted > 0) {
      onToast(`Deleted ${totalDeleted} selected item(s).`, 'info');
    } else {
      onToast('No items were deleted.', 'info');
    }
  };

  // Add a new download code to the user's downloads list
  const handleAddDownloadSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = inputCode.trim().toUpperCase();
    if (!cleanCode) {
      onToast('Please enter a valid file code.', 'error');
      return;
    }

    // Check if already in active queue
    if (downloadQueue.some((q) => q.code === cleanCode)) {
      onToast(`File '${cleanCode}' is already in your downloads queue.`, 'info');
      return;
    }

    // Check if already downloaded and stored in IndexedDB
    if (downloadedFiles.some((f) => f.code === cleanCode)) {
      onToast(`File '${cleanCode}' is already downloaded and stored on your device!`, 'info');
      setIsAddModalOpen(false);
      return;
    }

    try {
      setIsSubmittingAdd(true);

      // Verify file metadata from server
      const metaRes = await getFileMetadata(cleanCode);
      if (!metaRes.success || !metaRes.file) {
        throw new Error(metaRes.message || 'File not found or link has expired.');
      }

      const meta = metaRes.file;
      const totalPieces = meta.totalPieces || Math.ceil((meta.size || 1) / (meta.pieceSize || 512 * 1024));

      const newItem = {
        id: `${cleanCode}_${Date.now()}`,
        code: cleanCode,
        status: 'queued', // 'queued' | 'downloading' | 'completed' | 'error'
        progress: 0,
        speed: 0,
        fileName: meta.originalName || cleanCode,
        size: meta.size || 0,
        pieceSize: meta.pieceSize || 512 * 1024,
        totalPieces,
        bitfield: new Array(totalPieces).fill(false),
        mimeType: meta.mimeType || 'application/octet-stream',
        createdAt: new Date().toISOString(),
        password: inputPassword.trim(),
        error: null,
      };

      setDownloadQueue((prev) => [newItem, ...prev]);
      setInputCode('');
      setInputPassword('');
      setIsAddModalOpen(false);
      onToast(`Added '${newItem.fileName}' to your downloads list!`, 'success');
    } catch (err) {
      onToast(err.response?.data?.message || err.message || 'Failed to add download.', 'error');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  // Concurrency Limiter: strictly up to 3 downloads active concurrently, rest in waiting list
  useEffect(() => {
    const runningCount = activeDownloadIdsRef.current.size;
    const availableSlots = MAX_CONCURRENT_DOWNLOADS - runningCount;

    if (availableSlots <= 0) return;

    // Pick next items from waiting list that have not yet started and are not paused
    const nextToStart = downloadQueue
      .filter((item) => item.status === 'queued' && !item.isPaused && !activeDownloadIdsRef.current.has(item.id))
      .slice(0, availableSlots);

    if (nextToStart.length === 0) return;

    nextToStart.forEach((item) => {
      startDownloadItem(item);
    });
  }, [downloadQueue]);

  const startDownloadItem = async (item) => {
    activeDownloadIdsRef.current.add(item.id);
    const abortController = new AbortController();
    abortControllersRef.current.set(item.id, abortController);

    // 1. Transition item status to 'downloading'
    setDownloadQueue((prev) =>
      prev.map((q) => (q.id === item.id ? { ...q, status: 'downloading', progress: 5 } : q))
    );

    try {
      // 2. Fetch fresh metadata and seeders count
      const metaRes = await getFileMetadata(item.code);
      if (!metaRes.success || !metaRes.file) {
        throw new Error(metaRes.message || 'File not found or expired.');
      }

      if (abortController.signal.aborted) {
        throw new Error('Download cancelled by user.');
      }

      const meta = metaRes.file;
      setDownloadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? {
                ...q,
                fileName: meta.originalName,
                size: meta.size,
                totalPieces: meta.totalPieces || q.totalPieces,
                pieceSize: meta.pieceSize || q.pieceSize,
                seedersCount: meta.seedersCount || q.seedersCount || 1,
                progress: 10,
              }
            : q
        )
      );

      // 3. Download pieces via torrentEngine with item-level isPaused check
      await downloadTorrentFile(item.code, meta, {
        password: item.password,
        signal: abortController.signal,
        isPaused: () => pausedItemIdsRef.current.has(item.id),
        onProgress: ({ percent, speedBytesPerSec, bitfield, isVerifying, status: progressStatus }) => {
          const isItemPaused = pausedItemIdsRef.current.has(item.id);
          const isItemVerifying = isVerifying || progressStatus === 'verifying';
          setDownloadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id
                ? {
                    ...q,
                    status: isItemVerifying ? 'verifying' : q.status,
                    progress: isItemVerifying ? 100 : Math.max(10, Math.round(percent)),
                    speed: isItemPaused || isItemVerifying ? 0 : speedBytesPerSec,
                    bitfield: bitfield ? [...bitfield] : q.bitfield,
                    isPaused: isItemPaused,
                  }
                : q
            )
          );
        },
      });

      // 4. Mark complete
      setDownloadQueue((prev) =>
        prev.map((q) =>
          q.id === item.id
            ? { ...q, status: 'completed', progress: 100, speed: 0, isPaused: false }
            : q
        )
      );

      // Reload local files so it immediately reflects in storage table
      await loadLocalDownloads();
      onToast(`Download completed for '${meta.originalName || item.code}'!`, 'success');
    } catch (err) {
      if (abortController.signal.aborted) {
        console.log(`[DownloadQueue] Cancelled ${item.code}`);
      } else {
        console.error(`[DownloadQueue Error] Failed ${item.code}:`, err);
        setDownloadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: 'error',
                  error: err.response?.data?.message || err.message || 'Download failed',
                  speed: 0,
                }
              : q
          )
        );
      }
    } finally {
      activeDownloadIdsRef.current.delete(item.id);
      abortControllersRef.current.delete(item.id);
      pausedItemIdsRef.current.delete(item.id);
      // Trigger state update to pull next waiting item
      setDownloadQueue((prev) => [...prev]);
    }
  };

  const handleRemoveFromQueue = (id) => {
    if (abortControllersRef.current.has(id)) {
      abortControllersRef.current.get(id).abort();
      abortControllersRef.current.delete(id);
    }
    activeDownloadIdsRef.current.delete(id);
    pausedItemIdsRef.current.delete(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setDownloadQueue((prev) => prev.filter((item) => item.id !== id));
  };

  // Combine queue items and completed local files for display
  const completedCodesSet = new Set(downloadQueue.filter((q) => q.status === 'completed').map((q) => q.code));
  const activeDownloadsList = downloadQueue.filter((q) => q.status !== 'completed');

  // Stored files from IndexedDB that are not currently in the active queue
  const storedDownloadsList = downloadedFiles.filter((f) => !activeDownloadsList.some((q) => q.code === f.code));

  // Compute live queue statistics
  const activeCount = downloadQueue.filter((q) => q.status === 'downloading' && !q.isPaused).length;
  const waitingItems = downloadQueue.filter((q) => q.status === 'queued' && !q.isPaused);
  const waitingCount = waitingItems.length;
  const pausedCount = downloadQueue.filter((q) => q.isPaused).length;

  // All selectable item IDs
  const allItemKeys = [
    ...activeDownloadsList.map((q) => q.id),
    ...storedDownloadsList.map((r) => r.code),
  ];
  const totalDownloadsCount = allItemKeys.length;
  const allSelected = totalDownloadsCount > 0 && allItemKeys.every((k) => selectedIds.has(k));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allItemKeys));
    }
  };

  // Active detail item resolution for bottom 40% panel
  const activeDetailItem = selectedDetailId
    ? (downloadQueue.find((q) => q.id === selectedDetailId || q.code === selectedDetailId) ||
       downloadedFiles.find((f) => f.code === selectedDetailId || f.id === selectedDetailId) ||
       null)
    : null;

  return (
    <div className="max-w-6xl mx-auto px-4 pt-[5px] pb-[5px] flex-1 flex flex-col w-full min-h-0 animate-fade-in">
      
      {/* TOP HEADER */}
      <div className="mb-[5px] flex flex-col gap-0.5 shrink-0">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors w-fit"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Back to Main Page</span>
        </Link>
        <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 leading-tight">
          Downloads <Download className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />
        </h1>
      </div>

      {/* DOWNLOADS LIST & DETAILS (6:4 Split Container) */}
      <section
        className="glass-panel rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col flex-1 min-h-[580px] h-[calc(100vh-175px)] overflow-hidden"
        aria-label="Downloads Manager"
      >
        {/* Action Controls Toolbar: Add, Pause, Continue, Delete, Refresh */}
        <div className="p-4 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white/40 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. ADD DOWNLOAD BUTTON */}
            <button
              id="add-download-btn"
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-cyan-600/25 hover:scale-[1.02] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>

            {/* 2. PAUSE BUTTON */}
            <button
              id="pause-selected-btn"
              onClick={handlePauseSelected}
              disabled={selectedIds.size === 0}
              className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30"
              title={selectedIds.size === 0 ? 'Select items using checkboxes to pause' : `Pause ${selectedIds.size} selected item(s)`}
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>Pause</span>
              {selectedIds.size > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  {selectedIds.size}
                </span>
              )}
            </button>

            {/* 3. CONTINUE BUTTON */}
            <button
              id="continue-selected-btn"
              onClick={handleContinueSelected}
              disabled={selectedIds.size === 0}
              className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
              title={selectedIds.size === 0 ? 'Select items using checkboxes to continue' : `Continue ${selectedIds.size} selected item(s)`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Continue</span>
              {selectedIds.size > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  {selectedIds.size}
                </span>
              )}
            </button>

            {/* 4. DELETE BUTTON */}
            <button
              id="delete-selected-btn"
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className="px-3.5 py-2 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border border-rose-500/30"
              title={selectedIds.size === 0 ? 'Select items using checkboxes to delete' : `Delete ${selectedIds.size} selected item(s)`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
              {selectedIds.size > 0 && (
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400">
                  {selectedIds.size}
                </span>
              )}
            </button>
          </div>

          {/* REFRESH BUTTON */}
          <div className="flex items-center gap-3">
            <button
              onClick={loadLocalDownloads}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="Refresh downloads"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 6:4 SPLIT BOX CONTAINER (Top 60% with scroll when popout active, 100% when hidden) */}
        <div className="flex-1 flex flex-col min-h-0">
          
          {/* TOP 60% (or 100% when details popout hidden): DOWNLOADS LIST */}
          <div className={`${activeDetailItem ? 'h-[60%] border-b border-slate-200 dark:border-slate-800' : 'h-full flex-1'} flex flex-col min-h-0 relative bg-white/30 dark:bg-slate-900/30 transition-all duration-300`}>
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 animate-pulse gap-3">
                <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
                <span className="text-xs">Loading your downloads...</span>
              </div>
            ) : totalDownloadsCount === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Download className="w-6 h-6" />
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-semibold text-sm">
                  No downloads yet
                </p>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-1 px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/30 transition-all cursor-pointer"
                >
                  Add Your First Download
                </button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto overflow-x-auto min-h-0 downloads-table-scroll">
                <table className="w-full text-xs text-left border-collapse min-w-[700px]">
                  <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold text-[11px]">
                    <tr>
                      {/* 1. Checkbox (with Select All) */}
                      <th className="py-2.5 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500 cursor-pointer accent-cyan-600 align-middle"
                          title="Select All"
                        />
                      </th>

                      {/* 2. Name */}
                      <th className="py-2.5 px-3 min-w-[180px]">Name</th>

                      {/* 3. Size */}
                      <th className="py-2.5 px-3 w-20 text-right">Size</th>

                      {/* 4. Status (Progress bar with percentage written inside) */}
                      <th className="py-2.5 px-3 w-48 sm:w-56 text-center">Status</th>

                      {/* 5. Download Speed */}
                      <th className="py-2.5 px-3 w-28 text-right">Download Speed</th>

                      {/* 6. Upload Speed */}
                      <th className="py-2.5 px-3 w-24 text-right">Upload Speed</th>

                      {/* 7. ETA */}
                      <th className="py-2.5 px-3 w-20 text-center">ETA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                    {/* Active / Queued Downloads */}
                    {activeDownloadsList.map((item) => {
                      const isSelected = selectedIds.has(item.id);
                      const isDetailActive = selectedDetailId === item.id;
                      const waitingIndex = item.status === 'queued' ? waitingItems.findIndex((w) => w.id === item.id) + 1 : 0;
                      const itemProgress = Math.max(0, Math.min(100, item.progress || 0));

                      let statusBg = 'bg-cyan-500';
                      let statusText = `${itemProgress}%`;
                      if (item.status === 'error') {
                        statusBg = 'bg-rose-500';
                        statusText = 'Error';
                      } else if (item.status === 'verifying') {
                        statusBg = 'bg-indigo-500 animate-pulse';
                        statusText = 'Verifying (100%)';
                      } else if (item.isPaused) {
                        statusBg = 'bg-amber-500';
                        statusText = `Paused (${itemProgress}%)`;
                      } else if (item.status === 'queued') {
                        statusBg = 'bg-slate-400 dark:bg-slate-600';
                        statusText = `Waiting (${waitingIndex > 0 ? `#${waitingIndex}` : '0%'})`;
                      }

                      return (
                        <tr
                          key={item.id}
                          onClick={() => setSelectedDetailId(selectedDetailId === item.id ? null : item.id)}
                          onContextMenu={(e) => handleRowContextMenu(e, item, true)}
                          className={`transition-colors cursor-pointer select-none ${
                            isDetailActive
                              ? 'bg-cyan-500/15 dark:bg-cyan-950/40 text-slate-900 dark:text-slate-100'
                              : isSelected
                              ? 'bg-cyan-500/5 dark:bg-cyan-950/20 text-slate-900 dark:text-slate-100'
                              : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {/* 1. Checkbox */}
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(item.id)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500 cursor-pointer accent-cyan-600 align-middle"
                              aria-label={`Select ${item.fileName}`}
                            />
                          </td>

                          {/* 2. Name */}
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 shrink-0">
                                {item.code}
                              </span>
                              <span className="truncate max-w-[160px] sm:max-w-xs font-semibold" title={item.fileName}>
                                {item.fileName}
                              </span>
                            </div>
                          </td>

                          {/* 3. Size */}
                          <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                            {formatBytes(item.size)}
                          </td>

                          {/* 4. Status (Progress bar with percentage written inside) */}
                          <td className="py-2 px-3">
                            <div className="w-full h-5 bg-slate-200 dark:bg-slate-800 rounded-md overflow-hidden relative flex items-center justify-center border border-slate-300/40 dark:border-slate-700/40">
                              <div
                                className={`absolute left-0 top-0 bottom-0 transition-all duration-300 ${statusBg}`}
                                style={{ width: `${item.status === 'queued' ? 0 : itemProgress}%` }}
                              />
                              <span className="relative z-10 text-[10px] font-mono font-bold text-slate-900 dark:text-white drop-shadow-xs px-1 truncate">
                                {statusText}
                              </span>
                            </div>
                          </td>

                          {/* 5. Download Speed */}
                          <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                            {formatDownloadSpeed(item)}
                          </td>

                          {/* 6. Upload Speed */}
                          <td className="py-2 px-3 text-right font-mono text-[11px]">
                            {item.status === 'completed' ? (
                              isUploadAllowed(item.code) ? (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Seeding
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-500 font-normal">
                                  Stopped
                                </span>
                              )
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* 7. ETA */}
                          <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                            {formatETA(item)}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Stored / Completed Downloads */}
                    {storedDownloadsList.map((record) => {
                      const isSelected = selectedIds.has(record.code);
                      const isDetailActive = selectedDetailId === record.code;

                      return (
                        <tr
                          key={record.code}
                          onClick={() => setSelectedDetailId(selectedDetailId === record.code ? null : record.code)}
                          onContextMenu={(e) => handleRowContextMenu(e, record, false)}
                          className={`transition-colors cursor-pointer select-none ${
                            isDetailActive
                              ? 'bg-emerald-500/15 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100'
                              : isSelected
                              ? 'bg-cyan-500/5 dark:bg-cyan-950/20 text-slate-900 dark:text-slate-100'
                              : 'hover:bg-slate-100/70 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {/* 1. Checkbox */}
                          <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectItem(record.code)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500 cursor-pointer accent-cyan-600 align-middle"
                              aria-label={`Select ${record.name}`}
                            />
                          </td>

                          {/* 2. Name */}
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0">
                                {record.code}
                              </span>
                              <span className="truncate max-w-[160px] sm:max-w-xs font-semibold" title={record.name}>
                                {record.name}
                              </span>
                            </div>
                          </td>

                          {/* 3. Size */}
                          <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                            {formatBytes(record.size)}
                          </td>

                          {/* 4. Status (Progress bar with percentage written inside) */}
                          <td className="py-2 px-3">
                            <div className="w-full h-5 bg-slate-200 dark:bg-slate-800 rounded-md overflow-hidden relative flex items-center justify-center border border-slate-300/40 dark:border-slate-700/40">
                              <div
                                className="absolute left-0 top-0 bottom-0 bg-emerald-500 transition-all duration-300"
                                style={{ width: '100%' }}
                              />
                              <span className="relative z-10 text-[10px] font-mono font-bold text-white drop-shadow-xs px-1 truncate">
                                100%
                              </span>
                            </div>
                          </td>

                          {/* 5. Download Speed */}
                          <td className="py-2 px-3 text-right font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                            -
                          </td>

                          {/* 6. Upload Speed */}
                          <td className="py-2 px-3 text-right font-mono text-[11px]">
                            {isUploadAllowed(record.code) ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Seeding
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500 font-normal">
                                Stopped
                              </span>
                            )}
                          </td>

                          {/* 7. ETA */}
                          <td className="py-2 px-3 text-center font-mono text-emerald-600 dark:text-emerald-400 text-[11px]">
                            Done
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>          {/* BOTTOM 40%: DETAILS POPOUT (Displayed when item clicked once, hidden on second click) */}
          {activeDetailItem && (
            <div className="h-[40%] flex flex-col min-h-0 bg-slate-50/50 dark:bg-slate-950/40 p-4 sm:p-5 overflow-y-auto animate-fade-in border-t border-slate-200/80 dark:border-slate-800/80">
              {(() => {
                const isDetailQueueItem = downloadQueue.some((q) => q.id === activeDetailItem.id);
                const detailName = activeDetailItem.fileName || activeDetailItem.name || activeDetailItem.code;
                const detailSize = activeDetailItem.size || 0;
                const detailCode = activeDetailItem.code;
                const detailTotalPieces = activeDetailItem.totalPieces || Math.ceil((detailSize || 1) / (512 * 1024));
                const detailProgress = activeDetailItem.status === 'completed' || (!activeDetailItem.status && activeDetailItem.code)
                  ? 100
                  : (activeDetailItem.progress || 0);
                const isDetailCompleted = detailProgress === 100 || activeDetailItem.status === 'completed' || (!activeDetailItem.status && activeDetailItem.code);

                return (
                  <div className="flex flex-col h-full space-y-3 animate-fade-in">
                    {/* Detail Header & Action Buttons */}
                    <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isDetailCompleted
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                          }`}
                        >
                          {isDetailCompleted ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                              {detailCode}
                            </span>
                            <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate max-w-xs sm:max-w-md">
                              {detailName}
                            </h3>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatBytes(detailSize)} • {isDetailCompleted ? 'Stored on device & Seeding' : `${detailProgress}% completed`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Save to Computer if completed */}
                        {isDetailCompleted && (
                          <button
                            onClick={() => {
                              const localRecord = downloadedFiles.find((f) => f.code === detailCode) || activeDetailItem;
                              handleSaveToDisk(localRecord);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            title="Save to computer disk"
                          >
                            <FolderDown className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Save</span>
                          </button>
                        )}

                        {/* Copy Code */}
                        <button
                          onClick={() => handleCopyCode(detailCode)}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors cursor-pointer"
                          title="Copy file code"
                        >
                          {copiedCode === detailCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* View Swarm */}
                        <Link
                          to={`/download/${detailCode}`}
                          className="p-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors"
                          title="View swarm network"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>

                        {/* Delete */}
                        <button
                          onClick={() => {
                            if (isDetailQueueItem) {
                              handleRemoveFromQueue(activeDetailItem.id);
                            } else {
                              handleDeleteLocal(detailCode, detailName);
                            }
                            setSelectedDetailId(null);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Delete file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Close Details Pane */}
                        <button
                          onClick={() => setSelectedDetailId(null)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors cursor-pointer ml-1"
                          title="Close details (or click row again)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata & Swarm Badges */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0 text-xs">
                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80">
                        <span className="text-slate-400 text-[10px] uppercase font-semibold block">Swarm Seeders</span>
                        <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-0.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>{activeDetailItem.seedersCount || 1} Online</span>
                        </div>
                        <div className="text-[10px] text-slate-400">Zero IP disclosure</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80">
                        <span className="text-slate-400 text-[10px] uppercase font-semibold block">Chunk Architecture</span>
                        <div className="font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                          {detailTotalPieces} chunks
                        </div>
                        <div className="text-[10px] text-slate-400">P2P Hash Verified</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80">
                        <span className="text-slate-400 text-[10px] uppercase font-semibold block">Download Speed</span>
                        <div className="font-mono text-cyan-600 dark:text-cyan-400 mt-0.5">
                          {formatDownloadSpeed(activeDetailItem)}
                        </div>
                        <div className="text-[10px] text-slate-400">ETA: {formatETA(activeDetailItem)}</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800/80">
                        <span className="text-slate-400 text-[10px] uppercase font-semibold block">Storage</span>
                        <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mt-0.5">
                          <HardDrive className="w-3.5 h-3.5 text-cyan-500" />
                          <span>IndexedDB</span>
                        </div>
                        <div className="text-[10px] text-slate-400">Local Device Vault</div>
                      </div>
                    </div>

                    {/* Bitfield Chunks Grid */}
                    <div className="flex-1 min-h-0 flex flex-col pt-1">
                      <div className="flex items-center justify-between mb-1.5 shrink-0 text-xs">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Bitfield Chunks ({Math.round((detailProgress / 100) * detailTotalPieces)} / {detailTotalPieces} pieces)</span>
                        </span>
                        <span className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 font-bold">
                          {detailProgress}%
                        </span>
                      </div>

                      <div
                        className="flex-1 overflow-y-auto p-2 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800"
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(10px, 1fr))',
                          gap: '2px',
                          maxHeight: '110px',
                        }}
                      >
                        {Array.from({ length: Math.max(1, detailTotalPieces) }).map((_, idx) => {
                          const isAcquired = isDetailCompleted
                            ? true
                            : activeDetailItem.bitfield && activeDetailItem.bitfield[idx] !== undefined
                            ? activeDetailItem.bitfield[idx]
                            : idx < Math.round((detailProgress / 100) * detailTotalPieces);
                          return (
                            <div
                              key={idx}
                              className={`h-2.5 rounded-xs transition-colors ${
                                isAcquired
                                  ? isDetailCompleted
                                    ? 'bg-emerald-500 shadow-xs shadow-emerald-500/40'
                                    : 'bg-cyan-500 shadow-xs shadow-cyan-500/40'
                                  : 'bg-slate-300 dark:bg-slate-800'
                              }`}
                              title={`Chunk #${idx + 1}: ${isAcquired ? 'Verified' : 'Pending'}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </section>

      {/* RIGHT-CLICK OPTIONS POP-UP MENU */}
      {contextMenu && (
        <div
          className="fixed z-50 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-1.5 animate-fade-in text-xs font-medium backdrop-blur-md"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
            <span className="font-bold text-cyan-600 dark:text-cyan-400">{contextMenu.item.code}</span>
            <span className="text-[10px] uppercase font-semibold text-slate-500">Options</span>
          </div>

          {/* Option: Save to Computer (if completed) */}
          {(!contextMenu.isQueueItem || contextMenu.item.status === 'completed') && (
            <button
              onClick={() => {
                const item = contextMenu.item;
                setContextMenu(null);
                const localRecord = downloadedFiles.find((f) => f.code === item.code) || item;
                handleSaveToDisk(localRecord);
              }}
              className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <FolderDown className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span>Save to Computer</span>
            </button>
          )}

          {/* Option: Pause / Resume (if queue item) */}
          {contextMenu.isQueueItem && contextMenu.item.status !== 'completed' && contextMenu.item.status !== 'error' && (
            contextMenu.item.isPaused ? (
              <button
                onClick={() => {
                  const id = contextMenu.item.id;
                  setContextMenu(null);
                  pausedItemIdsRef.current.delete(id);
                  setDownloadQueue((prev) =>
                    prev.map((q) => (q.id === id ? { ...q, isPaused: false } : q))
                  );
                  onToast(`Resumed download for '${contextMenu.item.fileName}'.`, 'success');
                }}
                className="w-full text-left px-3.5 py-2 text-emerald-600 dark:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Resume Download</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  const id = contextMenu.item.id;
                  setContextMenu(null);
                  pausedItemIdsRef.current.add(id);
                  setDownloadQueue((prev) =>
                    prev.map((q) => (q.id === id ? { ...q, isPaused: true, speed: 0 } : q))
                  );
                  onToast(`Paused download for '${contextMenu.item.fileName}'.`, 'info');
                }}
                className="w-full text-left px-3.5 py-2 text-amber-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
              >
                <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                <span>Pause Download</span>
              </button>
            )
          )}

          {/* Option: Copy File Code */}
          <button
            onClick={() => {
              const code = contextMenu.item.code;
              setContextMenu(null);
              handleCopyCode(code);
            }}
            className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Copy File Code</span>
          </button>

          {/* Option: View File Swarm */}
          <Link
            to={`/download/${contextMenu.item.code}`}
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3.5 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>View File Swarm</span>
          </Link>

          {/* Option: Allow / Stop Upload (Seeding) */}
          {contextMenu.item && contextMenu.item.code && (
            <button
              onClick={() => {
                const item = contextMenu.item;
                const code = item.code;
                const name = item.fileName || item.name || code;
                setContextMenu(null);
                handleToggleUpload(code, name);
              }}
              className="w-full text-left px-3.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
            >
              {isUploadAllowed(contextMenu.item.code) ? (
                <>
                  <UploadCloud className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-amber-600 dark:text-amber-400 font-medium">Stop Upload</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Allow Upload</span>
                </>
              )}
            </button>
          )}

          <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

          {/* Option: Delete */}
          <button
            onClick={() => {
              const item = contextMenu.item;
              const isQueue = contextMenu.isQueueItem;
              setContextMenu(null);
              if (isQueue) {
                handleRemoveFromQueue(item.id);
                onToast(`Removed '${item.fileName}' from downloads.`, 'info');
              } else {
                handleDeleteLocal(item.code, item.name);
              }
            }}
            className="w-full text-left px-3.5 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* ADD DOWNLOAD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">Add New Download</h3>
                  <p className="text-xs text-slate-400">Enter the 6-character code to begin downloading</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDownloadSubmit} className="space-y-4">
              <div>
                <label htmlFor="modal-code-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  File Code
                </label>
                <input
                  id="modal-code-input"
                  type="text"
                  maxLength={10}
                  placeholder="e.g. 7X9K2M"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="w-full glass-input rounded-xl px-4 py-3 text-center font-mono font-bold text-lg tracking-widest uppercase focus:ring-2 focus:ring-cyan-500"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="modal-password-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Optional Password (if file is protected)
                </label>
                <div className="relative">
                  <input
                    id="modal-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Leave blank if no password"
                    value={inputPassword}
                    onChange={(e) => setInputPassword(e.target.value)}
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inputCode.trim() || isSubmittingAdd}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-cyan-600/25 transition-all disabled:opacity-50"
                >
                  {isSubmittingAdd ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking Code...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      <span>Start Download</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default DownloadsPage;
