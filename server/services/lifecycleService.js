/**
 * ⚡ TShare Application Lifecycle & Auto-Shutdown Service
 *
 * Automatically monitors connected browser tabs via SSE streams and heartbeat beacons.
 * When all browser tabs are closed, gracefully stops the TShare server, releases SQLite
 * locks, and frees the application port.
 */

class LifecycleService {
  constructor() {
    this.server = null;
    this.db = null;
    this.port = 21849;
    this.activeTabs = new Map(); // tabId -> { lastSeen: number, sseRes?: Response }
    this.hasHadConnection = false;
    this.shutdownTimer = null;
    this.startupTimer = null;
    this.openSockets = new Set();
    this.isShuttingDown = false;

    // Grace period in milliseconds after all tabs disconnect before stopping the server.
    // 5 seconds allows page reloads (F5) and fast navigation without stopping the server.
    this.SHUTDOWN_GRACE_MS = 5000;

    // Startup grace period: if no browser tab connects within 60 seconds after launch,
    // auto-stop to avoid abandoned background processes.
    this.STARTUP_TIMEOUT_MS = 60000;

    // Periodic sweep interval for inactive tabs (in case a tab crashed without sending unload beacon)
    this.SWEEP_INTERVAL_MS = 4000;
    this.TAB_STALE_MS = 9000;

    // Environmental toggle: allow disabling auto-shutdown in multi-user / daemon / docker deployments
    this.isAutoShutdownEnabled = process.env.ENABLE_AUTO_SHUTDOWN !== 'false';
  }

  init(server, db, port) {
    this.server = server;
    this.db = db;
    this.port = port;

    // Track active TCP sockets to ensure instantaneous port release on shutdown
    server.on('connection', (socket) => {
      this.openSockets.add(socket);
      socket.on('close', () => {
        this.openSockets.delete(socket);
      });
    });

    if (!this.isAutoShutdownEnabled) {
      console.log(`[Lifecycle] 🌐 Persistent mode: Auto-shutdown is disabled (ENABLE_AUTO_SHUTDOWN=false). Server will remain active.`);
      return;
    }

    // Start initial launch timeout waiting for the browser to open
    this.startupTimer = setTimeout(() => {
      if (!this.hasHadConnection && this.activeTabs.size === 0) {
        console.log(`[Lifecycle] No browser connected within ${this.STARTUP_TIMEOUT_MS / 1000}s of startup. Stopping server and freeing port ${this.port}...`);
        this.stopServer('STARTUP_TIMEOUT');
      }
    }, this.STARTUP_TIMEOUT_MS);

    // Periodic stale-tab cleanup sweep
    setInterval(() => {
      this.sweepStaleTabs();
    }, this.SWEEP_INTERVAL_MS);

    console.log(`[Lifecycle] Auto-shutdown monitor initialized. Server will stop and free port ${this.port} when browser tab is closed.`);
  }

  /**
   * Handle incoming Server-Sent Events stream from a browser tab
  sanitizeTabId(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    return /^[a-zA-Z0-9_-]{3,64}$/.test(trimmed) ? trimmed : null;
  }

  /**
   * Handle incoming Server-Sent Events stream from a browser tab
   */
  handleStream(req, res) {
    const rawTabId = req.query.tabId;
    const tabId = this.sanitizeTabId(rawTabId) || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Set headers for Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    this.onTabConnected(tabId, res);

    // Send initial handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', tabId, activeCount: this.activeTabs.size })}\n\n`);

    // Keepalive ping every 15s to prevent intermediary proxy timeouts
    const keepalive = setInterval(() => {
      try {
        res.write(`:keepalive\n\n`);
      } catch (err) {
        clearInterval(keepalive);
      }
    }, 15000);

    // Listen for tab/window close
    req.on('close', () => {
      clearInterval(keepalive);
      this.onTabDisconnected(tabId);
    });
  }

  /**
   * Handle heartbeat ping from a browser tab
   */
  handlePing(req, res) {
    const rawTabId = req.query.tabId || (req.body && req.body.tabId);
    const tabId = this.sanitizeTabId(rawTabId);
    if (tabId) {
      this.onTabPing(tabId);
    }
    return res.json({
      success: true,
      activeTabs: this.activeTabs.size,
      isShuttingDown: this.isShuttingDown,
    });
  }

  /**
   * Handle unload / pagehide beacon sent when the tab is closing
   */
  handleCloseBeacon(req, res) {
    let rawTabId = req.query.tabId;
    if (!rawTabId && req.body) {
      try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        rawTabId = body.tabId;
      } catch (e) {
        // ignore
      }
    }

    const tabId = this.sanitizeTabId(rawTabId);
    if (tabId) {
      this.onTabDisconnected(tabId);
    }

    // Always respond immediately to beacon
    return res.status(204).end();
  }

  /**
   * Return lifecycle status
   */
  getStatus() {
    return {
      activeTabs: this.activeTabs.size,
      hasHadConnection: this.hasHadConnection,
      isShuttingDown: this.isShuttingDown,
      port: this.port,
    };
  }

  onTabConnected(tabId, sseRes = null) {
    this.hasHadConnection = true;

    // Clear startup and shutdown timers
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = null;
    }
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
      console.log(`[Lifecycle] Browser tab reconnected (${tabId}). Shutdown aborted.`);
    }

    this.activeTabs.set(tabId, {
      lastSeen: Date.now(),
      sseRes,
    });

    console.log(`[Lifecycle] 🟢 Browser tab connected [${tabId}]. Active tabs: ${this.activeTabs.size}`);
  }

  onTabPing(tabId) {
    this.hasHadConnection = true;
    if (this.shutdownTimer) {
      clearTimeout(this.shutdownTimer);
      this.shutdownTimer = null;
    }

    const existing = this.activeTabs.get(tabId) || {};
    this.activeTabs.set(tabId, {
      ...existing,
      lastSeen: Date.now(),
    });
  }

  onTabDisconnected(tabId) {
    if (this.activeTabs.has(tabId)) {
      this.activeTabs.delete(tabId);
      console.log(`[Lifecycle] 🔴 Browser tab disconnected [${tabId}]. Remaining tabs: ${this.activeTabs.size}`);
    }

    this.checkTabsAndTriggerShutdown();
  }

  sweepStaleTabs() {
    if (this.activeTabs.size === 0) return;

    const now = Date.now();
    let removedAny = false;

    for (const [tabId, info] of this.activeTabs.entries()) {
      if (now - info.lastSeen > this.TAB_STALE_MS) {
        this.activeTabs.delete(tabId);
        removedAny = true;
        console.log(`[Lifecycle] ⏱️ Browser tab timed out [${tabId}]. Remaining tabs: ${this.activeTabs.size}`);
      }
    }

    if (removedAny) {
      this.checkTabsAndTriggerShutdown();
    }
  }

  checkTabsAndTriggerShutdown() {
    if (this.activeTabs.size === 0 && this.hasHadConnection && !this.shutdownTimer && !this.isShuttingDown) {
      console.log(`[Lifecycle] All browser tabs are closed. Grace period started (${this.SHUTDOWN_GRACE_MS / 1000}s) before freeing port ${this.port}...`);
      this.shutdownTimer = setTimeout(() => {
        if (this.activeTabs.size === 0) {
          console.log(`====================================================`);
          console.log(`🛑 [Lifecycle] Browser webpage closed.`);
          console.log(`🔒 Stopping TShare application and freeing port ${this.port}...`);
          console.log(`====================================================`);
          this.stopServer('BROWSER_TABS_CLOSED');
        }
      }, this.SHUTDOWN_GRACE_MS);
    }
  }

  stopServer(reason = 'NORMAL') {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log(`[Server] Initiating clean shutdown (Reason: ${reason})...`);

    // Force close lingering sockets after 1.5s to ensure the OS unbinds the port without delay
    setTimeout(() => {
      for (const socket of this.openSockets) {
        try {
          socket.destroy();
        } catch (e) {}
      }
    }, 1500);

    if (this.server) {
      this.server.close(() => {
        console.log(`[Server] HTTP server stopped. Port ${this.port} successfully freed.`);
        this.closeDatabaseAndExit(0);
      });
    } else {
      this.closeDatabaseAndExit(0);
    }

    // Failsafe timeout: force exit after 4s
    setTimeout(() => {
      console.log(`[Server] Forcing exit to guarantee port ${this.port} is freed.`);
      this.closeDatabaseAndExit(0);
    }, 4000);
  }

  closeDatabaseAndExit(exitCode = 0) {
    if (this.db) {
      try {
        this.db.close();
        console.log(`[Database] SQLite database connection closed.`);
      } catch (err) {
        // ignore
      }
    }
    console.log(`[TShare] Application exited cleanly. Goodbye!`);
    process.exit(exitCode);
  }
}

const lifecycleService = new LifecycleService();
module.exports = lifecycleService;
