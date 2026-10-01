// API service for todo operations
import { API_BASE, RECONNECT_DELAY_MS } from '../constants.js';

/**
 * Load todo content from server
 * @returns {Promise<string>} Todo markdown content
 */
export async function loadTodoContent() {
  const response = await fetch(`${API_BASE}/todo`);
  if (!response.ok) {
    throw new Error('Failed to load tasks');
  }
  const data = await response.json();
  return data.content;
}

/**
 * Save todo content to server
 * @param {string} content - Markdown content to save
 * @returns {Promise<void>}
 */
export async function saveTodoContent(content) {
  const response = await fetch(`${API_BASE}/todo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error('Failed to save tasks');
  }
}

/**
 * Setup file watcher with event source.
 *
 * The stream is only held open while the tab is visible. Browsers cap
 * concurrent connections per origin (Chrome allows 6 over HTTP/1.1), and this
 * stream never ends, so background tabs that kept it open would exhaust the
 * budget and leave every later request to this origin queued forever - the
 * whole app then fails to load in any new tab.
 *
 * @param {Function} onChangeCallback - Called when file changes
 * @returns {{close: Function}} Watcher handle
 */
export function setupFileWatcher(onChangeCallback) {
  let eventSource = null;
  let reconnectTimer = null;
  let resyncOnReconnect = false;
  let closed = false;

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };

  const connect = () => {
    if (closed || eventSource || document.hidden) return;

    const source = new EventSource(`${API_BASE}/todo/watch`);
    eventSource = source;

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'change') {
        console.log('File changed externally, reloading...');
        onChangeCallback();
      }
    };

    source.onerror = (err) => {
      console.error('EventSource error:', err);
      // Release the socket before waiting, so a failed stream never keeps
      // occupying one of the origin's few connection slots.
      source.close();
      if (eventSource === source) eventSource = null;
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };
  };

  const handleVisibilityChange = () => {
    if (document.hidden) {
      disconnect();
      resyncOnReconnect = true;
      return;
    }
    connect();
    if (resyncOnReconnect) {
      resyncOnReconnect = false;
      // Pick up any change that happened while disconnected.
      onChangeCallback();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  connect();

  return {
    close() {
      closed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      disconnect();
    }
  };
}
