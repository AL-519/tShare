import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, QrCode, Link as LinkIcon, Sparkles, X, ShieldCheck } from 'lucide-react';
import { formatBytes } from './Dropzone';

export const UploadModal = ({ isUploading, progress, uploadResult, onClose, onToast }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);

  if (!isUploading && !uploadResult) return null;

  const code = uploadResult?.code || '';
  const downloadUrl = uploadResult?.file?.downloadUrl || `${window.location.origin}/download/${code}`;
  const file = uploadResult?.file;

  const copyToClipboard = (text, isCode = true) => {
    navigator.clipboard.writeText(text);
    if (isCode) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      onToast('File code copied to clipboard!', 'success');
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      onToast('Download link copied to clipboard!', 'success');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg glass-panel rounded-3xl p-6 sm:p-8 shadow-2xl border border-indigo-500/30 overflow-hidden my-8">
        
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>

        {/* Close Button if finished */}
        {!isUploading && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* UPLOADING STATE */}
        {isUploading && (
          <div className="py-8 text-center flex flex-col items-center">
            <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-slate-800"
                  fill="transparent"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="34"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-indigo-500 transition-all duration-300 ease-out"
                  fill="transparent"
                  strokeDasharray={213}
                  strokeDashoffset={213 - (213 * progress) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute font-bold text-lg text-indigo-400 font-mono">
                {progress}%
              </span>
            </div>

            <h3 className="font-bold text-xl text-slate-100 mb-2">
              Preparing Local Share...
            </h3>
            <p className="text-sm text-slate-400 max-w-xs">
              Saving file safely on your device for instant peer sharing.
            </p>
          </div>
        )}

        {/* SUCCESS STATE */}
        {!isUploading && uploadResult && (
          <div className="py-2 space-y-6">
            <div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold w-fit mb-3">
                <ShieldCheck className="w-4 h-4" />
                <span>Ready to Share (Direct Device Seeding)</span>
              </div>

              <h3 className="font-extrabold text-2xl text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-2">
                Your Share Code <Sparkles className="w-5 h-5 text-amber-500 dark:text-amber-400" />
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Give this code to the recipient or send them the download link.
              </p>
            </div>

            {/* Prominent File Code Box */}
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/90 dark:from-indigo-950/80 via-slate-50/90 dark:via-slate-900 to-purple-50/90 dark:to-purple-950/80 border border-indigo-200 dark:border-indigo-500/40 text-center flex flex-col items-center justify-center shadow-xs">
              <span className="text-xs uppercase font-bold tracking-widest text-indigo-600 dark:text-indigo-300 mb-1">
                6-Character Access Code
              </span>
              <div className="text-4xl sm:text-5xl font-extrabold tracking-widest font-mono text-gradient mb-3">
                {code}
              </div>

              <div className="flex flex-wrap justify-center gap-3 w-full">
                <button
                  onClick={() => copyToClipboard(code, true)}
                  className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'Copied Code!' : 'Copy Code'}</span>
                </button>

                <button
                  onClick={() => copyToClipboard(downloadUrl, false)}
                  className="flex-1 min-w-[130px] px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
                  <span>{copiedLink ? 'Copied Link!' : 'Copy Link'}</span>
                </button>

                <button
                  onClick={() => setShowQR(!showQR)}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    showQR
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30'
                  }`}
                  title="Toggle QR Code"
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR</span>
                </button>
              </div>
            </div>

            {/* QR Code Container */}
            {showQR && (
              <div className="p-4 rounded-2xl bg-white flex flex-col items-center justify-center animate-fade-in shadow-xl">
                <QRCodeSVG value={downloadUrl} size={160} level="H" />
                <p className="text-xs text-slate-700 font-medium mt-2">
                  Scan with mobile camera to download instantly
                </p>
              </div>
            )}

            {/* File Details Summary */}
            <div className="rounded-xl bg-slate-100/80 dark:bg-slate-900/60 p-3.5 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 space-y-2">
              <div className="flex justify-between items-center">
                <span>File:</span>
                <span className="font-medium text-slate-900 dark:text-slate-200 truncate max-w-[220px]">
                  {file?.originalName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Size:</span>
                <span className="font-medium text-slate-900 dark:text-slate-200">
                  {formatBytes(file?.size)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Expires At:</span>
                <span className="font-medium text-amber-600 dark:text-amber-400">
                  {file?.expiresAt ? new Date(file.expiresAt).toLocaleString() : 'Never (Permanent link)'}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default UploadModal;
