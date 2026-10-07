import React, { useState, useEffect } from 'react';
import { formatBytes } from './Dropzone';

/**
 * Helper to format duration seconds into human readable torrent string:
 * e.g. "1y 116d", "12d 19h", "4m 12s", "45s"
 */
const formatTorrentDuration = (totalSeconds) => {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const sec = Math.floor(totalSeconds % 60);
  const min = Math.floor((totalSeconds / 60) % 60);
  const hrs = Math.floor((totalSeconds / 3600) % 24);
  const days = Math.floor(totalSeconds / 86400);

  if (days > 365) {
    const years = Math.floor(days / 365);
    const remDays = days % 365;
    return `${years}y ${remDays}d`;
  }
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${min}m`;
  if (min > 0) return `${min}m ${sec}s`;
  return `${sec}s`;
};

/**
 * Format timestamp into standard torrent client format: "DD/MM/YYYY, HH:MM:SS"
 */
const formatTorrentDate = (dateValue) => {
  if (!dateValue) return 'N/A';
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export const TorrentDetailsPanel = ({
  fileData = {},
  progress = 0,
  downloadSpeed = 0,
  averageDownloadSpeed = 0,
  uploadSpeed = 0,
  averageUploadSpeed = 0,
  bytesDownloaded = 0,
  bytesUploaded = 0,
  piecesHave = 0,
  totalPieces = 1,
  pieceSize = 512 * 1024,
  seedersCount = 0,
  peersCount = 0,
  timeActiveSec = 0,
  timeSeededSec = 0,
  reannounceSec = 5,
  completedOn = null,
  wastedBytes = 0,
  bitfield = [],
  showPieceMap = true,
}) => {
  const [togglePieceGrid, setTogglePieceGrid] = useState(true);

  // Compute values matching qBittorrent layout
  const totalSizeBytes = fileData.size || 0;
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  
  // ETA calculation
  let etaText = '∞';
  if (pct >= 100) {
    etaText = 'Done';
  } else if (downloadSpeed > 0) {
    const remBytes = Math.max(0, totalSizeBytes - bytesDownloaded);
    const etaSec = Math.round(remBytes / downloadSpeed);
    etaText = formatTorrentDuration(etaSec);
  }

  // Share ratio calculation
  const shareRatio = bytesDownloaded > 0 ? (bytesUploaded / bytesDownloaded).toFixed(2) : '0.00';

  // Format speeds
  const fmtSpeed = (spd) => (spd > 0 ? `${formatBytes(spd)}/s` : '0 B/s');

  const resolvedTotalPieces = totalPieces || Math.ceil(totalSizeBytes / (pieceSize || 512 * 1024)) || 1;
  const resolvedPiecesHave = Math.min(resolvedTotalPieces, piecesHave);

  return (
    <div className="w-full bg-slate-50/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 text-slate-800 dark:text-slate-200 font-sans shadow-xl dark:shadow-2xl backdrop-blur-xl animate-fade-in space-y-4">
      
      {/* 1. PROGRESS BAR (Identical to qBittorrent header) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400">Progress:</span>
          <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{pct}%</span>
        </div>
        <div className="w-full h-5 bg-slate-200 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-sm overflow-hidden p-0.5 relative">
          <div
            className="h-full bg-blue-600 transition-all duration-300 ease-out rounded-xs"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 2. TRANSFER FIELDSET SECTION */}
      <fieldset className="border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 pt-2 pb-4 bg-white/70 dark:bg-slate-950/40 text-[12px] leading-relaxed shadow-xs">
        <legend className="px-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-500 dark:bg-cyan-400"></span>
          <span>Transfer</span>
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-2 gap-x-6 pt-1">
          
          {/* COLUMN 1 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Time Active:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {formatTorrentDuration(timeActiveSec)} {timeSeededSec > 0 ? `(seeded for ${formatTorrentDuration(timeSeededSec)})` : ''}
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Downloaded:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {formatBytes(bytesDownloaded)} ({formatBytes(bytesDownloaded)} this session)
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Download Speed:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                {fmtSpeed(downloadSpeed)} ({fmtSpeed(averageDownloadSpeed || downloadSpeed)} average)
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Download Limit:</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">∞</span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Share Ratio:</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">{shareRatio}</span>
            </div>
          </div>

          {/* COLUMN 2 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">ETA:</span>
              <span className="font-mono text-amber-600 dark:text-amber-300 font-semibold">{etaText}</span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Uploaded:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200 truncate">
                {formatBytes(bytesUploaded)} ({formatBytes(bytesUploaded)} this session)
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Upload Speed:</span>
              <span className="font-mono text-purple-600 dark:text-purple-400 truncate">
                {fmtSpeed(uploadSpeed)} ({fmtSpeed(averageUploadSpeed || uploadSpeed)} average)
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Upload Limit:</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">∞</span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Re-announce In:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-300">{reannounceSec}s</span>
            </div>
          </div>

          {/* COLUMN 3: Swarm Metrics & Privacy */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Active Seeders:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                {seedersCount} online
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Swarm Visibility:</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 text-[11px] font-medium">
                Seeder Count Only
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Peer Privacy:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px]">
                Shielded (No IP exposed)
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Wasted:</span>
              <span className="font-mono text-slate-600 dark:text-slate-400">{formatBytes(wastedBytes)}</span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Last Seen Complete:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                {formatTorrentDate(fileData.createdAt || Date.now())}
              </span>
            </div>
          </div>

        </div>
      </fieldset>

      {/* 3. INFORMATION FIELDSET SECTION */}
      <fieldset className="border border-slate-200 dark:border-slate-700/80 rounded-xl px-4 pt-2 pb-4 bg-white/70 dark:bg-slate-950/40 text-[12px] leading-relaxed shadow-xs">
        <legend className="px-2 font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400"></span>
          <span>Information</span>
        </legend>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-y-2 gap-x-6 pt-1">
          
          {/* COLUMN 1 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Total Size:</span>
              <span className="font-mono text-slate-900 dark:text-slate-100 font-bold">{formatBytes(totalSizeBytes)}</span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Added On:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                {formatTorrentDate(fileData.createdAt || Date.now())}
              </span>
            </div>
          </div>

          {/* COLUMN 2 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Pieces:</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-300 font-semibold truncate">
                {resolvedTotalPieces} × {formatBytes(pieceSize)} (have {resolvedPiecesHave})
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Completed On:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                {pct >= 100 ? formatTorrentDate(completedOn || Date.now()) : 'In progress...'}
              </span>
            </div>
          </div>

          {/* COLUMN 3 */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Created By:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-300 text-[11px] truncate">
                TempVault WebTorrent Swarm
              </span>
            </div>

            <div className="flex justify-between items-baseline gap-2">
              <span className="text-slate-500 dark:text-slate-400 shrink-0">Created On:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300 text-[11px] truncate">
                {formatTorrentDate(fileData.createdAt || Date.now())}
              </span>
            </div>
          </div>

        </div>
      </fieldset>

      {/* 4. VISUAL PIECE MAP GRID (Interactive bitfield visualizer) */}
      {showPieceMap && resolvedTotalPieces > 0 && (
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 dark:text-slate-400 font-semibold flex items-center gap-1.5">
              <span>Torrent Bitfield Piece Map ({resolvedPiecesHave}/{resolvedTotalPieces} pieces acquired):</span>
            </span>
            <button
              type="button"
              onClick={() => setTogglePieceGrid(!togglePieceGrid)}
              className="text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline font-medium"
            >
              {togglePieceGrid ? 'Hide Piece Grid' : 'Show Piece Grid'}
            </button>
          </div>

          {togglePieceGrid && (
            <div
              className="max-h-32 overflow-y-auto p-2 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(14px, 1fr))',
                gap: '3px',
              }}
            >
              {Array.from({ length: resolvedTotalPieces }).map((_, idx) => {
                const isAcquired = bitfield && bitfield[idx] !== undefined ? bitfield[idx] : idx < resolvedPiecesHave;
                return (
                  <div
                    key={idx}
                    className={`h-3 rounded-xs transition-colors duration-150 ${
                      isAcquired
                        ? 'bg-blue-500 shadow-xs shadow-blue-500/50'
                        : 'bg-slate-300/80 dark:bg-slate-800/80 border border-slate-400/50 dark:border-slate-700/50'
                    }`}
                    title={`Piece #${idx + 1}: ${isAcquired ? 'Completed (512 KB)' : 'Pending'}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default TorrentDetailsPanel;
