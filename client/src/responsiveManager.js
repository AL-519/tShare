/**
 * ⚡ TShare — Universal Responsive Viewport & Manual Window Size Engine
 * =======================================================================
 * Automatically adapts the entire TShare interface across ALL screen sizes,
 * including arbitrary MANUAL window resizing by the user:
 *   - Arbitrary Manual Resizing (dragging window corner to ANY width/height)
 *   - Windows Snap & Tiling (Half-screen, 1/3, 2/3, 4-corner grid snap)
 *   - Small & Narrow Windows (< 400px companion/floating window)
 *   - Short Window Heights (< 600px split-screen horizontal or small laptops)
 *   - Standard Desktop / Laptop windows (1024px – 1600px)
 *   - Wide & Ultrawide Monitors (21:9, 32:9, 1440p, 4K UHD, stretched windows)
 *   - Mobile & Tablet devices (portrait, landscape, dynamic address bar compensation)
 *
 * Capabilities:
 *   1. Fluid Real-Time Adaptation: Updates within 1 frame (16ms) as user drags the window.
 *   2. Dynamic CSS Variables: --app-vh, --app-vw, --app-dvh, --app-window-width, --app-window-height.
 *   3. Intelligent Clamping: Prevents double-scrollbars, clipping, or modal overflow at any aspect ratio.
 *   4. Zero modifications to core business logic; 100% non-invasive.
 */

// Screen Breakpoint Classifications
export const BREAKPOINTS = {
  NANO: 360,
  PHONE_SM: 420,
  PHONE: 640,
  TABLET: 860,
  LAPTOP: 1100,
  DESKTOP: 1440,
  LARGE: 1800,
  ULTRAWIDE: 2560,
};

// Height Breakpoints
export const HEIGHT_BREAKPOINTS = {
  VERY_SHORT: 480,
  SHORT: 620,
  MEDIUM: 800,
  TALL: 1050,
};

// Current Active Metrics
let currentMetrics = {
  width: typeof window !== 'undefined' ? window.innerWidth : 1200,
  height: typeof window !== 'undefined' ? window.innerHeight : 800,
  dvh: typeof window !== 'undefined' ? window.innerHeight : 800,
  aspectRatio: 1.5,
  sizeCategory: 'laptop',
  widthTier: 'standard',
  heightTier: 'medium',
  orientation: 'landscape',
  isShortWindow: false,
  isNarrowWindow: false,
  isUltrawide: false,
  isTouch: false,
};

const listeners = new Set();

/**
 * Categorize arbitrary window width into fluid tiers
 */
function categorizeWidthTier(w) {
  if (w <= BREAKPOINTS.NANO) return 'nano';
  if (w <= BREAKPOINTS.PHONE_SM) return 'compact-phone';
  if (w <= BREAKPOINTS.PHONE) return 'phone';
  if (w <= BREAKPOINTS.TABLET) return 'tablet';
  if (w <= BREAKPOINTS.LAPTOP) return 'laptop';
  if (w <= BREAKPOINTS.DESKTOP) return 'desktop';
  if (w <= BREAKPOINTS.LARGE) return 'spacious';
  return 'ultrawide';
}

/**
 * Categorize arbitrary window height into fluid tiers
 */
function categorizeHeightTier(h) {
  if (h <= HEIGHT_BREAKPOINTS.VERY_SHORT) return 'very-short';
  if (h <= HEIGHT_BREAKPOINTS.SHORT) return 'short';
  if (h <= HEIGHT_BREAKPOINTS.MEDIUM) return 'medium';
  if (h <= HEIGHT_BREAKPOINTS.TALL) return 'tall';
  return 'very-tall';
}

/**
 * Categorize aspect ratio
 */
function categorizeAspectRatio(ratio) {
  if (ratio >= 3.0) return 'super-ultrawide'; // 32:9 and wider
  if (ratio >= 2.0) return 'ultrawide';       // 21:9
  if (ratio >= 1.5) return 'widescreen';     // 16:9, 16:10
  if (ratio >= 1.1) return 'standard';       // 4:3, 3:2, square
  return 'tall';                             // Portrait, narrow companion
}

/**
 * Generate comprehensive dynamic CSS rules for arbitrary manual window resizing
 */
function generateResponsiveStyles() {
  return `
/* ==========================================================================
   ⚡ TShare Universal Responsive & Manual Resize Engine
   ========================================================================== */

:root {
  --app-dvh: 100vh;
  --app-vw: 100vw;
  --app-vh: 100vh;
  --app-max-content-width: 72rem;
  --app-container-padding: clamp(0.5rem, 2vw, 1.5rem);
  --app-card-radius: clamp(1rem, 2vw, 1.75rem);
  --app-header-h: 4rem;
}

/* --------------------------------------------------------------------------
   A. Fluid Container Sizing: Scales smoothly with ANY manual window width
   -------------------------------------------------------------------------- */
.max-w-6xl {
  max-width: min(calc(100vw - var(--app-container-padding) * 2), var(--app-max-content-width)) !important;
  width: 100% !important;
  box-sizing: border-box !important;
}

.max-w-3xl {
  max-width: min(calc(100vw - var(--app-container-padding) * 2), 52rem) !important;
  width: 100% !important;
}

.max-w-xl {
  max-width: min(calc(100vw - var(--app-container-padding) * 2), 38rem) !important;
  width: 100% !important;
}

/* --------------------------------------------------------------------------
   B. Manual Window Widening: Ultrawide & Expanded Displays (≥ 1440px)
   -------------------------------------------------------------------------- */
@media (min-width: 1440px) {
  :root {
    --app-max-content-width: 86rem; /* 1376px */
  }
}

@media (min-width: 1750px) {
  :root {
    --app-max-content-width: 105rem; /* 1680px */
  }
}

@media (min-width: 2200px), (min-aspect-ratio: 21/9) and (min-width: 1600px) {
  :root {
    --app-max-content-width: 125rem; /* 2000px */
  }

  /* Expansive downloads manager view when user widens the window */
  section[aria-label="Downloads Manager"] {
    min-height: clamp(520px, calc(var(--app-vh, 100vh) - 180px), 850px) !important;
    height: calc(var(--app-vh, 100vh) - 175px) !important;
  }
}

@media (min-width: 3200px), (min-aspect-ratio: 32/9) and (min-width: 1920px) {
  :root {
    --app-max-content-width: 145rem; /* 2320px */
  }
}

/* --------------------------------------------------------------------------
   C. Manual Window Shortening: User resizes window vertically (< 700px height)
   -------------------------------------------------------------------------- */
@media (max-height: 720px) {
  :root {
    --app-header-h: 3.25rem;
  }

  header .h-16 {
    height: 3.25rem !important;
  }

  /* Fluid height for Downloads Manager in vertically compact windows */
  section[aria-label="Downloads Manager"] {
    min-height: 280px !important;
    height: calc(var(--app-vh, 100vh) - 120px) !important;
    margin-top: 0 !important;
    margin-bottom: 0 !important;
  }

  /* Compact padding in short windows to prioritize content */
  .py-8, .sm\\:py-12, .py-16 {
    padding-top: 1rem !important;
    padding-bottom: 1rem !important;
  }

  #hero-heading {
    font-size: clamp(1.75rem, 5vw, 2.75rem) !important;
    margin-bottom: 0.5rem !important;
  }

  section[aria-labelledby="hero-heading"] {
    margin-bottom: 1.5rem !important;
  }
}

/* Extremely short window (e.g. 400px - 520px height split-screen) */
@media (max-height: 540px) {
  :root {
    --app-header-h: 2.75rem;
  }

  header .h-16 {
    height: 2.75rem !important;
  }

  header a span.font-extrabold {
    font-size: 1.1rem !important;
  }

  section[aria-label="Downloads Manager"] {
    min-height: 220px !important;
    height: calc(var(--app-vh, 100vh) - 90px) !important;
  }

  /* In very short window mode, collapse footer to maximize work area */
  footer {
    padding-top: 0.5rem !important;
    padding-bottom: 0.5rem !important;
    font-size: 0.65rem !important;
  }
}

/* --------------------------------------------------------------------------
   D. Manual Window Narrowing: Snapping to side or narrow window (< 850px width)
   -------------------------------------------------------------------------- */
@media (max-width: 900px) {
  /* Ensure Home Page grid stacks cleanly */
  .grid.lg\\:grid-cols-12 {
    display: flex !important;
    flex-direction: column !important;
    gap: 1.25rem !important;
  }

  .lg\\:col-span-7,
  .lg\\:col-span-5 {
    width: 100% !important;
  }

  /* Fluid Downloads table */
  section[aria-label="Downloads Manager"] {
    min-height: clamp(340px, 60vh, 560px) !important;
  }
}

/* Narrow window (e.g. 350px - 560px width companion / side-snapped window) */
@media (max-width: 560px) {
  :root {
    --app-container-padding: 0.625rem;
  }

  /* Fluid 6-character code input boxes: never wrap to 2 lines */
  .grid-cols-6 {
    display: grid !important;
    grid-template-columns: repeat(6, 1fr) !important;
    gap: clamp(0.2rem, 1vw, 0.4rem) !important;
  }

  .grid-cols-6 input {
    width: 100% !important;
    min-width: 0 !important;
    height: clamp(2.35rem, 11vw, 3.25rem) !important;
    font-size: clamp(0.95rem, 4.5vw, 1.25rem) !important;
    padding: 0 !important;
    text-align: center !important;
  }

  /* Compact Navbar for side-snapped window */
  header .max-w-6xl {
    padding-left: 0.5rem !important;
    padding-right: 0.5rem !important;
  }

  header a span.font-extrabold {
    font-size: 1.05rem !important;
  }

  header a[href="/shared-files"],
  header a[href="/downloads"] {
    padding: 0.35rem 0.5rem !important;
    font-size: 0.6875rem !important;
  }

  /* Action buttons: Stack vertically in narrow manual windows */
  .download-buttons-container,
  .action-buttons-group {
    display: flex !important;
    flex-direction: column !important;
    width: 100% !important;
    gap: 0.5rem !important;
  }

  .download-buttons-container button,
  .action-buttons-group button {
    width: 100% !important;
    justify-content: center !important;
  }

  /* Table horizontal scroll touch & mouse ergonomics */
  .downloads-table-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-x: contain;
  }

  /* Sticky first column so row context is retained while panning horizontally */
  .downloads-table-scroll table th:first-child,
  .downloads-table-scroll table td:first-child {
    position: sticky;
    left: 0;
    z-index: 10;
    background: inherit;
    backdrop-filter: blur(8px);
  }

  /* Downloads manager action toolbar wrap */
  section[aria-label="Downloads Manager"] > div:first-child {
    padding: 0.5rem 0.75rem !important;
    gap: 0.375rem !important;
    flex-wrap: wrap !important;
  }

  section[aria-label="Downloads Manager"] > div:first-child button {
    padding: 0.35rem 0.6rem !important;
    font-size: 0.6875rem !important;
  }

  /* Dropzone responsive padding */
  .glass-panel.rounded-3xl {
    border-radius: 1.25rem !important;
    padding: 1rem !important;
  }
}

/* Ultra-narrow manual window (e.g. < 360px floating widget window) */
@media (max-width: 360px) {
  header a[href="/shared-files"] span,
  header a[href="/downloads"] span {
    display: none !important;
  }

  header a[href="/shared-files"],
  header a[href="/downloads"] {
    padding: 0.35rem !important;
  }

  #hero-heading {
    font-size: 1.55rem !important;
  }
}

/* --------------------------------------------------------------------------
   E. Dialogs & Modals: Centered, never exceed manual window viewport
   -------------------------------------------------------------------------- */
.fixed.inset-0 > div,
[role="dialog"] {
  max-width: min(calc(100vw - 1.5rem), 32rem) !important;
  max-height: min(calc(var(--app-vh, 100vh) - 2rem), 90vh) !important;
  overflow-y: auto !important;
  box-sizing: border-box !important;
}

/* --------------------------------------------------------------------------
   F. Touch-Device Enhancements
   -------------------------------------------------------------------------- */
@media (hover: none) and (pointer: coarse) {
  button,
  a[role="button"],
  input[type="checkbox"] {
    touch-action: manipulation;
  }

  * {
    -webkit-tap-highlight-color: transparent;
  }
}
`;
}

/**
 * Inject or update the dynamic responsive stylesheet
 */
function applyResponsiveStylesheet() {
  if (typeof document === 'undefined') return;

  const styleId = 'tshare-responsive-engine';
  let styleEl = document.getElementById(styleId);

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = generateResponsiveStyles();
}

/**
 * Measure viewport dimensions and update HTML attributes and CSS variables
 */
function updateMetrics() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  // Use visualViewport if available for mobile address bars & virtual keyboards
  const dvh = window.visualViewport ? window.visualViewport.height : height;
  const aspectRatio = width / (height || 1);

  const sizeCategory = categorizeWidthTier(width);
  const widthTier = categorizeWidthTier(width);
  const heightTier = categorizeHeightTier(height);
  const aspectCategory = categorizeAspectRatio(aspectRatio);
  const orientation = width >= height ? 'landscape' : 'portrait';
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  currentMetrics = {
    width,
    height,
    dvh,
    aspectRatio,
    sizeCategory,
    widthTier,
    heightTier,
    orientation,
    isShortWindow: height <= HEIGHT_BREAKPOINTS.SHORT,
    isNarrowWindow: width <= BREAKPOINTS.PHONE,
    isUltrawide: width >= BREAKPOINTS.LARGE || aspectRatio >= 2.0,
    isTouch,
  };

  const root = document.documentElement;

  // Real-time CSS Custom Properties
  root.style.setProperty('--app-vw', `${width}px`);
  root.style.setProperty('--app-vh', `${height}px`);
  root.style.setProperty('--app-dvh', `${dvh}px`);
  root.style.setProperty('--app-window-width', `${width}px`);
  root.style.setProperty('--app-window-height', `${height}px`);
  root.style.setProperty('--app-aspect-ratio', aspectRatio.toFixed(3));

  // Dynamic Data Attributes on <html> for fine-grained CSS selection
  root.dataset.screenSize = sizeCategory;
  root.dataset.widthTier = widthTier;
  root.dataset.heightTier = heightTier;
  root.dataset.orientation = orientation;
  root.dataset.aspectRatio = aspectCategory;
  root.dataset.inputMode = isTouch ? 'touch' : 'mouse';

  // Notify subscribed listeners
  listeners.forEach((cb) => {
    try {
      cb(currentMetrics);
    } catch (e) {
      console.error('[ResponsiveManager] Listener error:', e);
    }
  });
}

// Debounced RAF resize handler for 60fps / 120fps smooth window dragging
let rafId = null;
function handleResize() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    updateMetrics();
  });
}

/**
 * Initialize the Responsive Manager
 */
export function initResponsiveManager() {
  if (typeof window === 'undefined') return;

  // 1. Inject Stylesheet
  applyResponsiveStylesheet();

  // 2. Measure & Apply Initial Metrics
  updateMetrics();

  // 3. Attach Window Resize & Orientation Listeners
  window.addEventListener('resize', handleResize, { passive: true });
  window.addEventListener('orientationchange', handleResize, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleResize, { passive: true });
  }

  // 4. Attach ResizeObserver to capture document/container size changes (zoom, snap, devtools)
  if (typeof ResizeObserver !== 'undefined' && document.documentElement) {
    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(document.documentElement);
  }

  console.log(
    `%c⚡ TShare Responsive Engine Active%c [${currentMetrics.widthTier} x ${currentMetrics.heightTier} | ${currentMetrics.width}x${currentMetrics.height}px]`,
    'background: #4f46e5; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
    'color: #06b6d4; font-weight: 500;'
  );
}

/**
 * Subscribe to screen / window size changes
 */
export function addScreenSizeListener(callback) {
  listeners.add(callback);
  callback(currentMetrics);
  return () => listeners.delete(callback);
}

/**
 * Query current metrics synchronously
 */
export function getScreenSizeInfo() {
  return { ...currentMetrics };
}

// Auto-initialize immediately on module import in the browser
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResponsiveManager);
  } else {
    initResponsiveManager();
  }
}

export default {
  initResponsiveManager,
  getScreenSizeInfo,
  addScreenSizeListener,
  BREAKPOINTS,
  HEIGHT_BREAKPOINTS,
};
