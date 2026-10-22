import { useEffect } from 'react';

/**
 * ⚡ TShare Client Lifecycle Hook
 *
 * Maintains a persistent Server-Sent Events (SSE) connection and heartbeat pings
 * with the TShare backend. When the user closes the webpage / browser tab, the connection
 * is severed and an unload beacon is dispatched. The server detects that no tabs remain,
 * automatically shuts down the application, and frees the port.
 */

// Generate a random tab identifier unique to this browser tab instance
const getTabSessionId = () => {
  let id = sessionStorage.getItem('tshare_tab_instance_id');
  if (!id) {
    id = 'tab_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    try {
      sessionStorage.setItem('tshare_tab_instance_id', id);
    } catch (_) {}
  }
  return id;
};

export function useAppLifecycle() {
  useEffect(() => {
    const tabId = getTabSessionId();
    let eventSource = null;
    let heartbeatTimer = null;
    let reconnectTimeout = null;

    // 1. Establish SSE Connection for instant socket-drop detection
    const connectSSE = () => {
      try {
        eventSource = new EventSource(`/api/lifecycle/stream?tabId=${encodeURIComponent(tabId)}`);

        eventSource.onopen = () => {
          // SSE stream opened
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Reconnect attempt after 2 seconds if temporary glitch
          reconnectTimeout = setTimeout(connectSSE, 2000);
        };
      } catch (e) {
        // Fallback to heartbeat pings if SSE is unsupported
      }
    };

    connectSSE();

    // 2. Periodic Heartbeat Ping (every 2.5 seconds)
    const sendPing = () => {
      fetch(`/api/lifecycle/ping?tabId=${encodeURIComponent(tabId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Network error / server shutting down
      });
    };

    // Initial ping immediately
    sendPing();
    heartbeatTimer = setInterval(sendPing, 2500);

    // 3. Tab Close / Browser Exit Beacon
    const handleClose = () => {
      const closeUrl = `/api/lifecycle/close?tabId=${encodeURIComponent(tabId)}`;
      if (navigator.sendBeacon) {
        navigator.sendBeacon(closeUrl);
      } else {
        fetch(closeUrl, { method: 'POST', keepalive: true }).catch(() => {});
      }
    };

    const handleBeforeUnload = (e) => {
      if (window._tshareActiveTransfers && window._tshareActiveTransfers > 0) {
        e.preventDefault();
        e.returnValue = 'Active file transfers are in progress. Are you sure you want to close?';
      }
      handleClose();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleClose);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleClose);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);
}

export default useAppLifecycle;
