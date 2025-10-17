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
 * Setup file watcher with event source
 * @param {Function} onChangeCallback - Called when file changes
 * @returns {EventSource} Event source instance
 */
export function setupFileWatcher(onChangeCallback) {
  const eventSource = new EventSource(`${API_BASE}/todo/watch`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'change') {
      console.log('File changed externally, reloading...');
      onChangeCallback();
    }
  };

  eventSource.onerror = (err) => {
    console.error('EventSource error:', err);
    eventSource.close();
    // Attempt to reconnect
    setTimeout(() => {
      setupFileWatcher(onChangeCallback);
    }, RECONNECT_DELAY_MS);
  };

  return eventSource;
}
