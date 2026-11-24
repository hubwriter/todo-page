// Helpers for serving local files referenced by file:// links
import { dirname, normalize, resolve, sep } from 'path';
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
  return getLinkedFilePaths(categories).includes(normalizedPath);
}

function getLinkedFilePaths(categories) {
  if (!Array.isArray(categories)) return [];

  const paths = [];
  for (const category of categories) {
    if (!category || !Array.isArray(category.links)) continue;
    for (const link of category.links) {
      if (!link || typeof link.url !== 'string') continue;
      const linkedPath = fileUrlToNormalizedPath(link.url);
      if (linkedPath) paths.push(linkedPath);
    }
  }
  return paths;
}

/**
 * Whether a path may be served: it is a saved file:// link, or it is inside the
 * folder of a linked HTML page (so the page's CSS, scripts, and sibling pages load).
 * @param {*} categories - Parsed links categories
 * @param {string} normalizedPath - The normalized path to check
 * @returns {boolean}
 */
export function isPathAllowedByCategories(categories, normalizedPath) {
  return getLinkedFilePaths(categories).some(linkedPath =>
    linkedPath === normalizedPath ||
    (/\.html?$/i.test(linkedPath) && normalizedPath.startsWith(dirname(linkedPath) + sep))
  );
}

/**
 * Choose a content type for a served local file. HTML pages (with their CSS and
 * scripts), images, and PDFs are served with their real types; everything else
 * is served as plain text so it is displayed in the browser.
 * @param {string} filePath - Path of the file being served
 * @returns {string} A content-type value
 */
export function getLocalFileContentType(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();
  if (IMAGE_CONTENT_TYPES[ext]) return IMAGE_CONTENT_TYPES[ext];
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'html' || ext === 'htm') return 'text/html; charset=utf-8';
  if (ext === 'css') return 'text/css; charset=utf-8';
  if (ext === 'js' || ext === 'mjs') return 'text/javascript; charset=utf-8';
  return 'text/plain; charset=utf-8';
}
