// API service for backup operations
import { API_BASE } from '../constants.js';

/**
 * Load the list of recent backups from the server.
 * @returns {Promise<Array<{ filename: string, timestamp: string }>>}
 */
export async function loadBackups() {
  const response = await fetch(`${API_BASE}/backups`);
  if (!response.ok) {
    throw new Error('Failed to load backups');
  }
  const data = await response.json();
  return Array.isArray(data.backups) ? data.backups : [];
}

/**
 * Load the content of a single backup file.
 * @param {string} filename - Backup filename
 * @returns {Promise<string>} Backup markdown content
 */
export async function loadBackupContent(filename) {
  const response = await fetch(`${API_BASE}/backups/${encodeURIComponent(filename)}`);
  if (!response.ok) {
    throw new Error('Failed to load backup');
  }
  const data = await response.json();
  return data.content;
}
