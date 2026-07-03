// Validation and sanitization for the links payload
import { randomUUID } from 'crypto';
import {
  MAX_LINK_CATEGORY_LENGTH,
  MAX_LINK_URL_LENGTH,
  MAX_LINK_DESCRIPTION_LENGTH
} from '../src/constants.js';

/**
 * Validate and sanitize the links payload.
 * @param {*} categories - Raw categories value from the request body
 * @param {Function} [generateId] - Id generator for links missing an id (defaults to randomUUID)
 * @returns {{ isValid: true, value: Array } | { isValid: false, error: string }}
 */
export function sanitizeLinkCategories(categories, generateId = randomUUID) {
  if (!Array.isArray(categories)) {
    return { isValid: false, error: 'Categories must be an array' };
  }

  const cleaned = [];

  for (const category of categories) {
    if (!category || typeof category.name !== 'string') {
      return { isValid: false, error: 'Each category must have a name' };
    }

    const name = category.name.trim();
    if (!name || name.length > MAX_LINK_CATEGORY_LENGTH) {
      return { isValid: false, error: `Category names must be 1-${MAX_LINK_CATEGORY_LENGTH} characters` };
    }

    if (!Array.isArray(category.links)) {
      return { isValid: false, error: 'Each category must have a links array' };
    }

    const cleanLinks = [];

    for (const link of category.links) {
      if (!link || typeof link.url !== 'string') {
        return { isValid: false, error: 'Each link must have a URL' };
      }

      const url = link.url.trim();
      // Only allow http(s) and file URLs to prevent unsafe schemes (e.g. javascript:)
      if (!/^(https?|file):\/\//i.test(url) || url.length > MAX_LINK_URL_LENGTH) {
        return { isValid: false, error: 'Each link URL must be a valid http(s) or file URL' };
      }

      const description = typeof link.description === 'string' ? link.description : '';
      if (description.length > MAX_LINK_DESCRIPTION_LENGTH) {
        return { isValid: false, error: `Link descriptions must be ${MAX_LINK_DESCRIPTION_LENGTH} characters or fewer` };
      }

      const id = (typeof link.id === 'string' && link.id) ? link.id : generateId();
      cleanLinks.push({ id, url, description });
    }

    cleaned.push({ name, links: cleanLinks });
  }

  return { isValid: true, value: cleaned };
}
