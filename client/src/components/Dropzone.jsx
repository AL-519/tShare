import React, { useState, useRef } from 'react';
import { Upload, File, X, FileText, Image as ImageIcon, FileArchive, Music, Video } from 'lucide-react';

// Helper to format file sizes nicely
export const formatBytes = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Helper for file type icons
const getFileIcon = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-purple-400" />;
  if (mimeType.startsWith('video/')) return <Video className="w-8 h-8 text-rose-400" />;
  if (mimeType.startsWith('audio/')) return <Music className="w-8 h-8 text-emerald-400" />;
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('compressed')) {
    return <FileArchive className="w-8 h-8 text-amber-400" />;
  }
  if (mimeType.includes('pdf') || mimeType.includes('text') || mimeType.includes('document')) {
    return <FileText className="w-8 h-8 text-blue-400" />;
  }
  return <File className="w-8 h-8 text-indigo-400" />;
};

export const Dropzone = ({ selectedFile, onFileSelect, onFileRemove, onFileError }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      onFileSelect(file);
    }
  };

  const handleInputChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelect(file);
    }
  };

  return (
    <div className="w-full">
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 p-8 text-center flex flex-col items-center justify-center group ${
            isDragOver
              ? 'border-indigo-400 bg-indigo-500/10 scale-[1.01]'
              : 'border-slate-300 dark:border-slate-700/80 hover:border-indigo-500/50 bg-slate-100/60 dark:bg-slate-900/40 hover:bg-slate-200/50 dark:hover:bg-slate-800/30'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-indigo-500/20 transition-all duration-300">
            <Upload className="w-8 h-8 text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
          </div>

          <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100 mb-1">
            Drag & Drop your file here
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
            or <span className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">browse from device</span>
          </p>

          <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 shadow-xs">No file size limit</span>
            <span className="px-2.5 py-1 rounded-lg bg-white/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 shadow-xs">All file formats supported</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-indigo-500/30 bg-white/80 dark:bg-slate-900/60 p-4 flex items-center justify-between shadow-lg backdrop-blur-md">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700">
              {getFileIcon(selectedFile.type)}
            </div>
            <div className="min-w-0">
              <h4 className="font-medium text-slate-900 dark:text-slate-100 truncate text-sm sm:text-base">
                {selectedFile.name}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatBytes(selectedFile.size)} • {selectedFile.type || 'Unknown Type'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onFileRemove}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/20 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-500/30 transition-colors shrink-0 ml-3"
            title="Remove file"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default Dropzone;
