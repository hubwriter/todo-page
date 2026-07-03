// API service for links operations
import { API_BASE } from '../constants.js';

/**
 * Load link categories from the server
 * @returns {Promise<Array>} Array of category objects: { name, links: [{ id, url, description }] }
 */
export async function loadLinks() {
  const response = await fetch(`${API_BASE}/links`);
  if (!response.ok) {
    throw new Error('Failed to load links');
  }
  const data = await response.json();
  return Array.isArray(data.categories) ? data.categories : [];
}

/**
 * Save link categories to the server
 * @param {Array} categories - Array of category objects to persist
 * @returns {Promise<void>}
 */
export async function saveLinks(categories) {
  const response = await fetch(`${API_BASE}/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categories }),
  });

  if (!response.ok) {
    throw new Error('Failed to save links');
  }
}
