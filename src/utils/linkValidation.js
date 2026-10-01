import {
  MAX_LINK_CATEGORY_LENGTH,
  MAX_LINK_DESCRIPTION_LENGTH,
  MAX_LINK_URL_LENGTH
} from '../constants.js';

export function validateLinkCategories(categories) {
  if (!Array.isArray(categories)) {
    return { valid: false, error: 'Links JSON must be an array of categories.' };
  }
  const ids = new Set();
  for (const category of categories) {
    if (!category || typeof category.name !== 'string') {
      return { valid: false, error: 'Every category must have a name.' };
    }
    const name = category.name.trim();
    if (!name || name.length > MAX_LINK_CATEGORY_LENGTH || !Array.isArray(category.links)) {
      return { valid: false, error: 'Every category needs a valid name and links array.' };
    }
    for (const link of category.links) {
      if (!link || typeof link.id !== 'string' || !link.id || ids.has(link.id)) {
        return { valid: false, error: 'Every link needs a unique stable ID.' };
      }
      ids.add(link.id);
      if (typeof link.url !== 'string' ||
          !/^(https?|file):\/\//i.test(link.url.trim()) ||
          link.url.length > MAX_LINK_URL_LENGTH) {
        return { valid: false, error: `Link ${link.id} has an invalid URL.` };
      }
      if (typeof link.description !== 'string' ||
          link.description.length > MAX_LINK_DESCRIPTION_LENGTH) {
        return { valid: false, error: `Link ${link.id} has an invalid description.` };
      }
    }
  }
  return { valid: true };
}
