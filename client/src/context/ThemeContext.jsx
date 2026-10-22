import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    try {
      const saved = localStorage.getItem('tshare_theme') || localStorage.getItem('tempvault_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      // Default to modern dark mode
      return 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#070a12');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#f8fafc');
    }
    try {
      localStorage.setItem('tshare_theme', theme);
    } catch (e) {
      console.warn('Could not persist theme in localStorage', e);
    }
  }, [theme]);

  const setTheme = (newTheme) => {
    setThemeState(newTheme === 'light' ? 'light' : 'dark');
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isDark = theme === 'dark';
  const isLight = theme === 'light';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, isLight }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;
