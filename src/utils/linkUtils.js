// Link entry utilities (validation, normalization, id generation)

// Matches URLs that already declare an http(s) protocol
const HTTP_PROTOCOL_REGEX = /^https?:\/\//i;

// Matches local file URLs (e.g. file:///Users/me/notes.md)
const FILE_PROTOCOL_REGEX = /^file:\/\//i;

// Schemes that are safe to render as clickable links
const SAFE_PROTOCOL_REGEX = /^(https?|file):\/\//i;

/**
 * Generate a unique id for a link entry
 * @returns {string} Unique identifier
 */
export function createLinkId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `link-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Check whether a URL is a safe, clickable link (http, https, or file).
 * Used to guard against unsafe schemes (e.g. javascript:) when rendering.
 * @param {string} url - URL to test
 * @returns {boolean} True if the URL uses a safe scheme
 */
export function isSafeLinkUrl(url) {
  return typeof url === 'string' && SAFE_PROTOCOL_REGEX.test(url.trim());
}

/**
 * Normalize and validate a user-entered URL.
 * Accepts http(s) URLs (adding https:// when no scheme is present) and local
 * file URLs (file://...).
 * @param {string} input - Raw URL text entered by the user
 * @returns {string|null} Normalized URL, or null if the input is not a valid URL
 */
export function normalizeUrl(input) {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  // Local file URLs are kept as-is (once validated)
  if (FILE_PROTOCOL_REGEX.test(trimmed)) {
    try {
      const fileUrl = new URL(trimmed);
      if (fileUrl.protocol !== 'file:') return null;
      // Require an actual path (e.g. file:///path/to/file)
      if (!fileUrl.pathname || fileUrl.pathname === '/') return null;
      return fileUrl.href;
    } catch {
      return null;
    }
  }

  const candidate = HTTP_PROTOCOL_REGEX.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const { hostname } = parsed;
  if (!hostname) return null;

  // Require a dotted hostname (a domain) or localhost so inputs like
  // "not a url" or "notaurl" are rejected rather than silently accepted.
  if (hostname !== 'localhost' && !hostname.includes('.')) return null;

  return parsed.href;
}
