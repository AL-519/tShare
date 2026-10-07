import React from 'react';
import { Trash2, FolderX, X, AlertTriangle, HardDrive, Link2Off } from 'lucide-react';

export const DeleteConfirmModal = ({ isOpen, onClose, onConfirmDelete, file }) => {
  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md glass-panel rounded-3xl p-6 shadow-2xl border border-rose-500/20 my-8">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 dark:text-rose-400">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">
              Delete Options
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[240px]" title={file.originalName || file.code}>
              {file.originalName || file.code} ({file.code})
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 mb-5">
          Choose how you would like to delete this file:
        </p>

        {/* Two Delete Options */}
        <div className="space-y-3 mb-6">
          
          {/* Option 1: Delete the file and entry in list */}
          <button
            type="button"
            id="delete-file-and-entry-btn"
            onClick={() => onConfirmDelete(file.code, 'full')}
            className="w-full text-left p-4 rounded-2xl border border-rose-500/30 hover:border-rose-500/60 bg-rose-500/5 hover:bg-rose-500/10 transition-all duration-200 group flex items-start gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-500 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-rose-600 dark:text-rose-400 mb-0.5 flex items-center justify-between">
                <span>Delete the file and entry in list</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 font-semibold uppercase">Erase File</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Permanently deletes the stored file from this device's memory and removes the share link from your list.
              </p>
            </div>
          </button>

          {/* Option 2: Delete entry from list but keep the file */}
          <button
            type="button"
            id="delete-entry-only-btn"
            onClick={() => onConfirmDelete(file.code, 'list_only')}
            className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 hover:border-indigo-500/50 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all duration-200 group flex items-start gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
              <Link2Off className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-slate-900 dark:text-slate-200 mb-0.5 flex items-center justify-between">
                <span>Delete entry from list but keep the file</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Keep File</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Removes the share entry from your active list and deactivates public sharing, while keeping the file stored safely on your device.
              </p>
            </div>
          </button>

        </div>

        {/* Footer Cancel */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
};

export default DeleteConfirmModal;
