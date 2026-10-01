// API service for todo operations
import { API_BASE, RECONNECT_DELAY_MS } from '../constants.js';
import { readApiError, ResourceProtocolError } from './resourceErrors.js';

const OUTDATED_SERVER_MESSAGE = 'The task server returned an outdated response. Restart the app server, then try again. Your edits are still here.';

function readVersionedTodoResponse(payload, operation) {
  const contentType = typeof payload?.content;
  const versionType = typeof payload?.version;
  if (contentType !== 'string' || versionType !== 'string' || !payload.version) {
    throw new ResourceProtocolError(
      `Invalid todo ${operation} response: content=${contentType}, version=${versionType}`,
      OUTDATED_SERVER_MESSAGE,
      {
        operation,
        contentType,
        versionType,
        responseKeys: payload && typeof payload === 'object' ? Object.keys(payload) : []
      }
    );
  }
  return payload;
}

/**
 * Load todo content from server
 * @returns {Promise<{content: string, version: string}>}
 */
export async function loadTodoContent() {
  const response = await fetch(`${API_BASE}/todo`);
  if (!response.ok) {
    await readApiError(response, 'Failed to load tasks');
  }
  return readVersionedTodoResponse(await response.json(), 'load');
}

/**
 * Save todo content to server
 * @param {string} content - Markdown content to save
 * @param {string} baseVersion
 * @returns {Promise<{content: string, version: string}>}
 */
export async function saveTodoContent(content, baseVersion) {
  const response = await fetch(`${API_BASE}/todo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content, baseVersion }),
  });

  if (!response.ok) {
    await readApiError(response, 'Failed to save tasks');
  }
  return readVersionedTodoResponse(await response.json(), 'save');
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
  let resyncOnReconnect = true;
  let closed = false;

  const resync = () => {
    if (!resyncOnReconnect || closed) return;
    resyncOnReconnect = false;
    onChangeCallback({ resource: null, version: null, resync: true });
  };

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

    const source = new EventSource(`${API_BASE}/watch`);
    eventSource = source;

    source.onopen = () => {
      if (eventSource !== source) return;
      resync();
    };

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.resource && Object.hasOwn(data, 'version')) {
        onChangeCallback(data);
      }
    };

    source.onerror = (err) => {
      if (eventSource !== source) return;
      console.error('EventSource error:', err);
      resyncOnReconnect = true;
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
