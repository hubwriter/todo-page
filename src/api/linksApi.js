// API service for links operations
import { API_BASE } from '../constants.js';
import { readApiError, ResourceProtocolError } from './resourceErrors.js';

const OUTDATED_SERVER_MESSAGE = 'The links server returned an outdated response. Restart the app server, then try again. Your edits are still here.';

function readVersionedLinksResponse(payload, operation) {
  const contentType = typeof payload?.rawContent;
  const versionType = typeof payload?.version;
  if (contentType !== 'string' || versionType !== 'string' || !payload.version) {
    throw new ResourceProtocolError(
      `Invalid links ${operation} response: content=${contentType}, version=${versionType}`,
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
 * Load link categories from the server
 * @returns {Promise<{categories: Array|null, rawContent: string, version: string, invalid: boolean, error?: string}>}
 */
export async function loadLinks() {
  const response = await fetch(`${API_BASE}/links`);
  if (!response.ok) {
    await readApiError(response, 'Failed to load links');
  }
  return readVersionedLinksResponse(await response.json(), 'load');
}

/**
 * Save link categories to the server
 * @param {Array} categories - Array of category objects to persist
 * @param {string} baseVersion
 * @param {{replaceInvalid?: boolean}} options
 */
export async function saveLinks(categories, baseVersion, { replaceInvalid = false } = {}) {
  const response = await fetch(`${API_BASE}/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ categories, baseVersion, replaceInvalid }),
  });

  if (!response.ok) {
    await readApiError(response, 'Failed to save links');
  }
  return readVersionedLinksResponse(await response.json(), 'save');
}
