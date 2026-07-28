// Server-side helpers for managing todo backup files.
//
// Backups live in the same directory as the todo file and are named
// `todo-backup-YYYYMMDDTHHMMSS.md`. Only the MAX_BACKUPS most recent files are
// kept on disk; older ones are pruned whenever a new backup is created.
import fs from 'fs/promises';
import { dirname, join } from 'path';
import {
  backupFileName,
  isBackupFileName,
  parseBackupTimestamp
} from '../src/utils/backupUtils.js';
import { MAX_BACKUPS } from '../src/constants.js';

/**
 * List all backup files alongside the todo file, newest first.
 * @param {string} todoFilePath - Absolute path to the todo file
 * @returns {Promise<Array<{ filename: string, timestamp: Date }>>}
 */
export async function listBackupFiles(todoFilePath) {
  const dir = dirname(todoFilePath);

  let entries;
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  return entries
    .filter(isBackupFileName)
    .map((filename) => ({ filename, timestamp: parseBackupTimestamp(filename) }))
    .filter((entry) => entry.timestamp instanceof Date)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Return the newest backups (up to `limit`) with ISO timestamps for the client.
 * @param {string} todoFilePath - Absolute path to the todo file
 * @param {number} [limit=MAX_BACKUPS]
 * @returns {Promise<Array<{ filename: string, timestamp: string }>>}
 */
export async function listBackups(todoFilePath, limit = MAX_BACKUPS) {
  const files = await listBackupFiles(todoFilePath);
  return files.slice(0, limit).map(({ filename, timestamp }) => ({
    filename,
    timestamp: timestamp.toISOString()
  }));
}

/**
 * Delete backups beyond the `keep` most recent.
 * @param {string} todoFilePath - Absolute path to the todo file
 * @param {number} [keep=MAX_BACKUPS]
 * @returns {Promise<void>}
 */
export async function pruneBackups(todoFilePath, keep = MAX_BACKUPS) {
  const files = await listBackupFiles(todoFilePath);
  const dir = dirname(todoFilePath);
  const toDelete = files.slice(keep);

  await Promise.all(
    toDelete.map(({ filename }) => fs.unlink(join(dir, filename)).catch(() => {}))
  );
}

/**
 * Write a backup of the given content, then prune to MAX_BACKUPS.
 * @param {string} todoFilePath - Absolute path to the todo file
 * @param {string} content - Content to back up
 * @param {Date} [now=new Date()] - Timestamp for the backup (injectable for tests)
 * @returns {Promise<string>} The backup filename that was written
 */
export async function createBackup(todoFilePath, content, now = new Date()) {
  const dir = dirname(todoFilePath);
  const filename = backupFileName(now);

  await fs.writeFile(join(dir, filename), content, 'utf-8');
  await pruneBackups(todoFilePath);

  return filename;
}

/**
 * Read the content of a named backup file.
 * @param {string} todoFilePath - Absolute path to the todo file
 * @param {string} filename - Backup filename (validated against the pattern)
 * @returns {Promise<string|null>} Content, or null if invalid/not found
 */
export async function readBackup(todoFilePath, filename) {
  // Reject anything that isn't a well-formed backup name (guards traversal).
  if (!isBackupFileName(filename)) return null;

  const dir = dirname(todoFilePath);
  try {
    return await fs.readFile(join(dir, filename), 'utf-8');
  } catch {
    return null;
  }
}
