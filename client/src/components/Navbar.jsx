import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Share2, Sun, Moon, Download, Power } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { ShutdownConfirmModal } from './ShutdownConfirmModal';

export const Navbar = () => {
  const location = useLocation();
  const { toggleTheme, isDark } = useTheme();
  const [isShutdownModalOpen, setIsShutdownModalOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-950/85 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
        
        {/* Logo & Brand Name */}
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/25 group-hover:scale-105 transition-transform">
            <Share2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-xl tracking-tight text-gradient">
              TShare
            </span>
          </div>
        </Link>

        {/* Right Section: Theme Toggle & Navigation Links */}
        <div className="flex items-center gap-2 sm:gap-3">
          
          {/* Light / Dark Mode Toggle Button */}
          <button
            id="theme-toggle-btn"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
            title={isDark ? 'Switch to Light mode' : 'Switch to Dark modern mode'}
            aria-label="Toggle theme mode"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 rotate-0 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-600 transition-transform duration-300 -rotate-12 hover:rotate-0" />
            )}
          </button>

          {/* Server Shutdown Confirmation Button */}
          <button
            id="server-shutdown-btn"
            onClick={() => setIsShutdownModalOpen(true)}
            className="p-2 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-500/40 transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm cursor-pointer"
            title="Shut Down Server (Confirm with prompt)"
            aria-label="Shut Down Server"
          >
            <Power className="w-4 h-4" />
          </button>

          {/* Navigation Links */}
          <Link
            to="/shared-files"
            id="nav-shared-files-link"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              location.pathname === '/shared-files'
                ? 'bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">My Shared Files</span>
            <span className="sm:hidden">Shared</span>
          </Link>

          <Link
            to="/downloads"
            id="nav-downloads-link"
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0 ${
              location.pathname === '/downloads'
                ? 'bg-cyan-600/10 dark:bg-cyan-600/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Downloads</span>
          </Link>
        </div>

      </div>

      {/* Server Shutdown Confirmation Modal */}
      <ShutdownConfirmModal
        isOpen={isShutdownModalOpen}
        onClose={() => setIsShutdownModalOpen(false)}
      />
    </header>
  );
};

export default Navbar;
