import React, { useState } from 'react';
import { Power, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { shutdownServer } from '../services/api';

export const ShutdownConfirmModal = ({ isOpen, onClose, onToast }) => {
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  const handleConfirmShutdown = async () => {
    try {
      setIsShuttingDown(true);
      await shutdownServer();
      setIsDone(true);
      if (onToast) onToast('TShare server stopped successfully.', 'info');
    } catch (err) {
      // In many environments the server connection drops immediately when process exits
      setIsDone(true);
      if (onToast) onToast('TShare server stopping...', 'info');
    } finally {
      setIsShuttingDown(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-rose-500/30 my-8">
        
        {/* Close Button (if not yet shutdown) */}
        {!isDone && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {!isDone ? (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 dark:text-rose-400">
                <Power className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-xl text-slate-900 dark:text-slate-100">
                  Shut Down Server?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  TShare Background Service
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/25 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                Stopping the server will terminate any active file uploads, downloads, and peer seeding sessions. The application port (21844) will be freed immediately.
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Are you sure you want to stop the background Express server? You will need to relaunch TShare to share or download files again.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isShuttingDown}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-shutdown-btn"
                onClick={handleConfirmShutdown}
                disabled={isShuttingDown}
                className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Power className="w-4 h-4" />
                <span>{isShuttingDown ? 'Stopping Server...' : 'Confirm & Shut Down'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 space-y-4 animate-fade-in">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-xl text-slate-900 dark:text-slate-100">
                Server Successfully Stopped
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">
                The local TShare server process has exited and port 21844 has been freed. You can safely close this browser window.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.close()}
              className="py-2.5 px-6 rounded-xl btn-primary text-xs font-semibold cursor-pointer"
            >
              Close Tab
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default ShutdownConfirmModal;
