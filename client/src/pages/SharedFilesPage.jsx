import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Share2,
  Trash2,
  RefreshCw,
  ArrowLeft,
  Lock,
  HardDrive,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Download,
  Layers,
  Users,
  Radio,
  MoreVertical
} from 'lucide-react';
import { fetchMySharedFiles, deleteFile } from '../services/api';
import { deleteLocalFile, getAllLocalFiles, getLocalFile } from '../services/db';
import { startTorrentSeederService } from '../services/torrentEngine';
import { formatBytes } from '../components/Dropzone';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';

export const SharedFilesPage = ({ onToast }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingCode, setDeletingCode] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [localCodesSet, setLocalCodesSet] = useState(new Set());
  const [modalTargetFile, setModalTargetFile] = useState(null);
  const [openMenuCode, setOpenMenuCode] = useState(null);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const [apiRes, localFiles] = await Promise.all([
        fetchMySharedFiles(),
        getAllLocalFiles(),
      ]);

      if (apiRes.success) {
        setFiles(apiRes.files || []);
      }
      setLocalCodesSet(new Set((localFiles || []).map((f) => f.code.toUpperCase())));
    } catch (err) {
      onToast('Failed to load your shared files.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
    startTorrentSeederService();
    document.title = 'My Shared Files | TempVault Peer-to-Peer Transfer';

    const handleOutsideClick = () => setOpenMenuCode(null);
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpenMenuCode(null);
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('click', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleConfirmDelete = async (code, mode) => {
    const target = files.find((f) => f.code === code) || { code };
    const displayName = target.originalName || code;

    try {
      setDeletingCode(code);
      setModalTargetFile(null);
      setOpenMenuCode(null);

      // 1. Retrieve local file record for creator token if stored
      const localRec = await getLocalFile(code);
      const creatorToken = localRec?.creatorToken || null;

      // 2. Remove share entry on server (revokes link and stops seeding coordinator)
      await deleteFile(code, creatorToken);

      if (mode === 'full') {
        // 2a. Delete file from local IndexedDB
        await deleteLocalFile(code);
        onToast(`File '${displayName}' and share entry permanently deleted.`, 'success');
        setLocalCodesSet((prev) => {
          const next = new Set(prev);
          next.delete(code.toUpperCase());
          return next;
        });
      } else {
        // 2b. Keep file on device, only remove entry from list
        onToast(`Removed '${displayName}' from list. File preserved safely on your device.`, 'info');
      }

      // Remove from shared list UI
      setFiles((prev) => prev.filter((f) => f.code !== code));
    } catch (err) {
      onToast(err.response?.data?.message || 'Failed to delete file entry.', 'error');
    } finally {
      setDeletingCode(null);
    }
  };

  const handleCopyLink = (code) => {
    const shareUrl = `${window.location.origin}/download/${code}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedCode(code);
    onToast('Share link copied to clipboard!', 'success');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 animate-fade-in">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Main Page</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-3">
            Shared Files <Share2 className="w-6 h-6 text-indigo-500 dark:text-indigo-400" />
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Files you uploaded on this browser. Track your active links and manage expiries.
          </p>
        </div>

        <button
          onClick={loadFiles}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center gap-2 transition-colors shadow-xs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* SHARED FILES TABLE / CARDS */}
      <div className="glass-panel rounded-3xl p-6 shadow-2xl border border-indigo-500/20">
        
        {loading ? (
          <div className="py-16 text-center text-slate-400 animate-pulse flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
            <span>Loading your shared files...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Share2 className="w-7 h-7" />
            </div>
            <div>
              <p className="text-slate-200 font-semibold text-base mb-1">No shared files found</p>
              <p className="text-xs text-slate-400 max-w-sm">
                Files you share from this device will appear here. Files are stored locally in your browser IndexedDB.
              </p>
            </div>
            <Link
              to="/"
              className="mt-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
            >
              Share a File Now
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
              <thead className="text-xs uppercase bg-slate-100/90 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Swarm Status</th>
                  <th className="px-4 py-3">Expires At</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                {files.map((file) => {
                  const isSeedingLocally = localCodesSet.has(file.code.toUpperCase());
                  return (
                    <tr key={file.id || file.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        <div className="flex items-center gap-2">
                          <Link to={`/download/${file.code}`} className="hover:underline flex items-center gap-1 font-mono tracking-wider">
                            {file.code}
                            <ExternalLink className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                          </Link>
                          <button
                            onClick={() => handleCopyLink(file.code)}
                            title="Copy Share Link"
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          >
                            {copiedCode === file.code ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="px-4 py-4 font-medium text-slate-900 dark:text-slate-100 max-w-[220px] truncate">
                        <span className="flex items-center gap-2" title={file.originalName}>
                          {file.isPasswordProtected && (
                            <span title="Password Protected">
                              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            </span>
                          )}
                          <span className="truncate">{file.originalName}</span>
                        </span>
                      </td>

                      <td className="px-4 py-4 text-xs font-mono">{formatBytes(file.size)}</td>

                      {/* Swarm Seeding Status */}
                      <td className="px-4 py-4">
                        {isSeedingLocally ? (
                          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse"></span>
                            <span>Seeding ({file.seedersCount || 1} online)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                            <Radio className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                            <span>Remote Swarm</span>
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-4 text-xs text-amber-700 dark:text-amber-300">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                          <span>{file.expiresAt ? new Date(file.expiresAt).toLocaleString() : 'Never'}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Download className="w-3.5 h-3.5 text-slate-500" />
                          <span>{file.downloadCount}</span>
                        </div>
                      </td>

                      <td className="px-4 py-4 text-right">
                        <div className="relative inline-block text-left">
                          {/* Three Dots Vertical Option Button */}
                          <button
                            id={`options-menu-btn-${file.code}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuCode(openMenuCode === file.code ? null : file.code);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Options"
                            aria-label="Item Options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {/* Options Dropdown Menu */}
                          {openMenuCode === file.code && (
                            <div
                              className="absolute right-0 mt-1 w-48 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl py-1.5 z-30 animate-fade-in"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Delete Option (Triggers dual delete confirmation modal) */}
                              <button
                                id={`option-delete-${file.code}`}
                                onClick={() => {
                                  setOpenMenuCode(null);
                                  setModalTargetFile(file);
                                }}
                                disabled={deletingCode === file.code}
                                className="w-full text-left px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                <span>Delete Options...</span>
                              </button>

                              <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

                              {/* Copy Share Link */}
                              <button
                                onClick={() => {
                                  setOpenMenuCode(null);
                                  handleCopyLink(file.code);
                                }}
                                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Copy Share Link</span>
                              </button>

                              {/* Open Download Page */}
                              <Link
                                to={`/download/${file.code}`}
                                onClick={() => setOpenMenuCode(null)}
                                className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>Open Download Page</span>
                              </Link>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* DUAL DELETE CONFIRMATION MODAL */}
      <DeleteConfirmModal
        isOpen={!!modalTargetFile}
        file={modalTargetFile}
        onClose={() => setModalTargetFile(null)}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
};

export default SharedFilesPage;
