import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import SharedFilesPage from './pages/SharedFilesPage';
import DownloadsPage from './pages/DownloadsPage';
import GuidelinesPage from './pages/GuidelinesPage';
import { ThemeProvider } from './context/ThemeContext';
import { useAppLifecycle } from './services/appLifecycle';

export function App() {
  useAppLifecycle();
  const [toast, setToast] = useState({ message: '', type: 'info' });

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  return (
    <ThemeProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-surface-900 text-slate-800 dark:text-slate-100 font-sans transition-colors duration-300">
          
          {/* Navigation Bar with Theme Toggle */}
          <Navbar />

            {/* Page Viewport */}
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<HomePage onToast={showToast} />} />
                <Route path="/download/:code" element={<DownloadPage onToast={showToast} />} />
                <Route path="/shared-files" element={<SharedFilesPage onToast={showToast} />} />
                <Route path="/downloads" element={<DownloadsPage onToast={showToast} />} />
                <Route path="/guidelines" element={<GuidelinesPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>

            {/* Global Toast Alert */}
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast({ message: '', type: 'info' })}
            />

            {/* Footer */}
            <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-6 text-xs text-slate-500 dark:text-slate-400 glass-panel mt-auto transition-colors duration-300">
              <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="flex items-center gap-2">
                  <span>&copy; {new Date().getFullYear()} TShare • Peer-to-Peer File Transfer</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <Link
                    to="/guidelines"
                    id="footer-guidelines-link"
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1.5 font-semibold transition-colors"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    <span>Safety Guidelines & Server Disclaimer</span>
                  </Link>
                  <span className="text-slate-400 dark:text-slate-600 hidden md:inline">•</span>
                  <span className="text-slate-400 dark:text-slate-500 hidden md:inline">Direct Device Transfer</span>
                </div>
              </div>
            </footer>

          </div>
        </Router>
    </ThemeProvider>
  );
}

export default App;
