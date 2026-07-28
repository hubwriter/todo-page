// Shared helpers for todo backup files.
//
// A backup is stored alongside todo.md as `todo-backup-YYYYMMDDTHHMMSS.md`,
// where the datetime is in local time. These helpers are pure (no Node or DOM
// dependencies) so they can be used by both the Express server and the Vue app.

export const BACKUP_PREFIX = 'todo-backup-';
export const BACKUP_SUFFIX = '.md';

// Matches `todo-backup-YYYYMMDDTHHMMSS.md` and captures the date/time parts.
export const BACKUP_FILENAME_REGEX =
  /^todo-backup-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Format a Date as a backup timestamp string (YYYYMMDDTHHMMSS) in local time.
 * @param {Date} date
 * @returns {string}
 */
export function formatBackupStamp(date) {
  return (
    `${date.getFullYear()}` +
    `${pad2(date.getMonth() + 1)}` +
    `${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}` +
    `${pad2(date.getMinutes())}` +
    `${pad2(date.getSeconds())}`
  );
}

/**
 * Build the backup filename for a given Date.
 * @param {Date} date
 * @returns {string} e.g. `todo-backup-20260728T143052.md`
 */
export function backupFileName(date) {
  return `${BACKUP_PREFIX}${formatBackupStamp(date)}${BACKUP_SUFFIX}`;
}

/**
 * Whether a filename matches the backup naming pattern. Also serves as a guard
 * against path traversal, since the pattern allows no slashes or dots elsewhere.
 * @param {string} name
 * @returns {boolean}
 */
export function isBackupFileName(name) {
  return typeof name === 'string' && BACKUP_FILENAME_REGEX.test(name);
}

/**
 * Parse a backup filename into a local-time Date, or null if it doesn't match.
 * @param {string} name
 * @returns {Date|null}
 */
export function parseBackupTimestamp(name) {
  if (typeof name !== 'string') return null;
  const match = BACKUP_FILENAME_REGEX.exec(name);
  if (!match) return null;

  const [, year, month, day, hours, minutes, seconds] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
    Number(seconds)
  );
  return Number.isNaN(date.getTime()) ? null : date;
}
