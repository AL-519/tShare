import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import HomePage from './pages/HomePage';
import DownloadPage from './pages/DownloadPage';
import SharedFilesPage from './pages/SharedFilesPage';
import DownloadsPage from './pages/DownloadsPage';
import { ThemeProvider } from './context/ThemeContext';

export function App() {
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
            <footer className="border-t border-slate-200/80 dark:border-slate-800/80 py-6 text-center text-xs text-slate-500 dark:text-slate-400 glass-panel mt-auto transition-colors duration-300">
              <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
                <span>&copy; {new Date().getFullYear()} TempVault • Peer-to-Peer File Transfer</span>
                <span className="text-slate-500 dark:text-slate-500">Direct Device Transfer • Configurable Link Expiration</span>
              </div>
            </footer>

          </div>
        </Router>
    </ThemeProvider>
  );
}

export default App;
