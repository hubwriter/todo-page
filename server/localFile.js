// Helpers for serving local files referenced by file:// links
import { normalize, resolve } from 'path';
import { IMAGE_CONTENT_TYPES } from '../src/constants.js';

/**
 * Convert a file:// URL to a normalized absolute path.
 * @param {string} fileUrl - A file:// URL
 * @returns {string|null} The normalized path, or null if not a valid file URL
 */
export function fileUrlToNormalizedPath(fileUrl) {
  try {
    const url = new URL(fileUrl);
    if (url.protocol !== 'file:') return null;
    return normalize(resolve(decodeURIComponent(url.pathname)));
  } catch {
    return null;
  }
}

/**
 * Whether a normalized path is referenced by a file:// link in the categories.
 * @param {*} categories - Parsed links categories
 * @param {string} normalizedPath - The normalized path to look for
 * @returns {boolean}
 */
export function isPathReferencedByCategories(categories, normalizedPath) {
  if (!Array.isArray(categories)) return false;

  for (const category of categories) {
    if (!category || !Array.isArray(category.links)) continue;
    for (const link of category.links) {
      if (!link || typeof link.url !== 'string') continue;
      if (fileUrlToNormalizedPath(link.url) === normalizedPath) return true;
    }
  }
  return false;
}

/**
 * Choose a safe content type for a served local file. Images and PDFs are served
 * as-is; everything else is served as plain text so it is displayed (not
 * executed) in the browser.
 * @param {string} filePath - Path of the file being served
 * @returns {string} A content-type value
 */
export function getLocalFileContentType(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();
  if (IMAGE_CONTENT_TYPES[ext]) return IMAGE_CONTENT_TYPES[ext];
  if (ext === 'pdf') return 'application/pdf';
  return 'text/plain; charset=utf-8';
}
