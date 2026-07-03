// Mapping between tab names and URL hashes.
// The Markdown tab uses the 'editor' key internally but the '#markdown' hash.

export const TAB_TO_HASH = { tasks: 'tasks', editor: 'markdown', notes: 'notes', links: 'links' };
export const HASH_TO_TAB = { tasks: 'tasks', markdown: 'editor', notes: 'notes', links: 'links' };

export const DEFAULT_TAB = 'tasks';

/**
 * Get the hash (without '#') for a tab, defaulting to the Tasks tab.
 * @param {string} tab - Internal tab key
 * @returns {string} Hash name
 */
export function tabToHash(tab) {
  return TAB_TO_HASH[tab] || DEFAULT_TAB;
}

/**
 * Get the internal tab key for a hash, or null if the hash is unknown.
 * Accepts values with or without a leading '#'.
 * @param {string} hash - Hash value (e.g. '#links' or 'links')
 * @returns {string|null} Tab key, or null if not recognised
 */
export function hashToTab(hash) {
  const clean = String(hash ?? '').replace(/^#/, '');
  return HASH_TO_TAB[clean] || null;
}

/**
 * Resolve the tab to show for a given hash, defaulting to the Tasks tab.
 * @param {string} hash - Hash value (e.g. '#links' or 'links')
 * @returns {string} Tab key
 */
export function getTabFromHash(hash) {
  return hashToTab(hash) || DEFAULT_TAB;
}
