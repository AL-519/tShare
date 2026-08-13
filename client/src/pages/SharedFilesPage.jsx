import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Share2, 
  Trash2, 
  RefreshCw, 
  ArrowLeft, 
  Lock, 
  HardDrive, 
  Cloud,
  FileText,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Download
} from 'lucide-react';
import { fetchMySharedFiles, deleteFile } from '../services/api';
import { deleteLocalFile } from '../services/db';
import { startStreamRelayService } from '../services/streamRelay';
import { formatBytes } from '../components/Dropzone';

export const SharedFilesPage = ({ onToast }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingCode, setDeletingCode] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const data = await fetchMySharedFiles();
      if (data.success) {
        setFiles(data.files || []);
      }
    } catch (err) {
      onToast('Failed to load your shared files.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
    startStreamRelayService();
  }, []);

  const handleDeleteFile = async (code, filename) => {
    if (!window.confirm(`Are you sure you want to delete '${filename || code}'? This link will immediately stop working.`)) return;

    try {
      setDeletingCode(code);
      await deleteFile(code);
      await deleteLocalFile(code);
      onToast(`File '${filename || code}' deleted successfully.`, 'success');
      setFiles((prev) => prev.filter((f) => f.code !== code));
    } catch (err) {
      onToast('Failed to delete file.', 'error');
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
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-indigo-400 mb-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Main Page</span>
          </Link>
          <h1 className="text-3xl font-extrabold text-slate-100 flex items-center gap-3">
            Shared Files <Share2 className="w-6 h-6 text-indigo-400" />
          </h1>
          <p className="text-sm text-slate-400">
            Files uploaded by you only. Track active share links, download limits, and manage expiries.
          </p>
        </div>

        <button
          onClick={loadFiles}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-2 transition-colors shadow-sm"
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
                Files you upload will appear here. Only you can view your active shared files on this browser session.
              </p>
            </div>
            <Link
              to="/"
              className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all"
            >
              Upload a File Now
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="text-xs uppercase bg-slate-900/80 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">File Name</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Storage</th>
                  <th className="px-4 py-3">Expires At</th>
                  <th className="px-4 py-3">Downloads</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {files.map((file) => (
                  <tr key={file.id || file.code} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-4 font-mono font-bold text-indigo-400">
                      <div className="flex items-center gap-2">
                        <Link to={`/download/${file.code}`} className="hover:underline flex items-center gap-1">
                          {file.code}
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </Link>
                        <button
                          onClick={() => handleCopyLink(file.code)}
                          title="Copy Share Link"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        >
                          {copiedCode === file.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-100 max-w-[220px] truncate">
                      <span className="flex items-center gap-2" title={file.originalName}>
                        {file.isPasswordProtected && (
                          <span title="Password Protected">
                            <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          </span>
                        )}
                        {file.originalName}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono">{formatBytes(file.size)}</td>
                    <td className="px-4 py-4">
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 capitalize">
                        {file.storageProvider === 'imagekit' ? (
                          <Cloud className="w-3 h-3 text-purple-400" />
                        ) : (
                          <HardDrive className="w-3 h-3 text-indigo-400" />
                        )}
                        {file.storageProvider}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-amber-300">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>{new Date(file.expiresAt).toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <Download className="w-3.5 h-3.5 text-slate-500" />
                        <span>{file.downloadCount} {file.maxDownloads ? `/ ${file.maxDownloads}` : ''}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => handleDeleteFile(file.code, file.originalName)}
                        disabled={deletingCode === file.code}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 ml-auto transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};

export default SharedFilesPage;
