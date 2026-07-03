// Composable for links management logic
import { ref, computed } from 'vue';
import { loadLinks as apiLoadLinks, saveLinks as apiSaveLinks } from '../api/linksApi.js';
import { createLinkId } from '../utils/linkUtils.js';
import { DEFAULT_LINK_CATEGORY } from '../constants.js';

/**
 * Ensure loaded data matches the expected shape:
 * an array of { name: string, links: [{ id, url, description }] }.
 * Duplicate category names are merged and missing ids are generated.
 */
function normalizeCategories(data) {
  if (!Array.isArray(data)) return [];

  const result = [];

  for (const category of data) {
    if (!category || typeof category.name !== 'string') continue;

    const name = category.name.trim();
    if (!name) continue;

    const rawLinks = Array.isArray(category.links) ? category.links : [];
    const cleanLinks = [];

    for (const link of rawLinks) {
      if (!link || typeof link.url !== 'string') continue;
      cleanLinks.push({
        id: (typeof link.id === 'string' && link.id) ? link.id : createLinkId(),
        url: link.url,
        description: typeof link.description === 'string' ? link.description : ''
      });
    }

    const existing = result.find(c => c.name === name);
    if (existing) {
      existing.links.push(...cleanLinks);
    } else {
      result.push({ name, links: cleanLinks });
    }
  }

  return result;
}

export function useLinks() {
  const categories = ref([]);
  const error = ref('');

  /**
   * Names of all categories, always including the default category so it is
   * offered in the dropdown even before any links exist.
   */
  const categoryNames = computed(() => {
    const names = categories.value.map(c => c.name);
    if (!names.includes(DEFAULT_LINK_CATEGORY)) {
      names.unshift(DEFAULT_LINK_CATEGORY);
    }
    return names;
  });

  function findCategory(name) {
    return categories.value.find(c => c.name === name);
  }

  function removeEmptyCategory(name) {
    const index = categories.value.findIndex(c => c.name === name);
    if (index !== -1 && categories.value[index].links.length === 0) {
      categories.value.splice(index, 1);
    }
  }

  /**
   * Load links from the server
   */
  async function loadLinks() {
    try {
      error.value = '';
      const data = await apiLoadLinks();
      categories.value = normalizeCategories(data);
      return categories.value;
    } catch (err) {
      error.value = `Error loading links: ${err.message}`;
      console.error('Error loading links:', err);
      return null;
    }
  }

  /**
   * Save links to the server
   */
  async function saveLinks() {
    try {
      error.value = '';
      await apiSaveLinks(categories.value);
    } catch (err) {
      error.value = `Error saving links: ${err.message}`;
      console.error('Error saving links:', err);
      throw err;
    }
  }

  /**
   * Add a new link entry to the top of its category (creating the category if needed)
   */
  async function addLink({ category, url, description }) {
    const entry = { id: createLinkId(), url, description };
    const existing = findCategory(category);

    if (existing) {
      existing.links.unshift(entry);
    } else {
      categories.value.push({ name: category, links: [entry] });
    }

    await saveLinks();
  }

  /**
   * Update an existing link entry. If the category changed, the entry moves to
   * the top of the new category and any emptied category is removed.
   */
  async function updateLink(id, oldCategory, { category, url, description }) {
    const sourceCategory = findCategory(oldCategory);
    if (!sourceCategory) return;

    const index = sourceCategory.links.findIndex(l => l.id === id);
    if (index === -1) return;

    const entry = sourceCategory.links[index];
    entry.url = url;
    entry.description = description;

    if (category !== oldCategory) {
      sourceCategory.links.splice(index, 1);
      const targetCategory = findCategory(category);
      if (targetCategory) {
        targetCategory.links.unshift(entry);
      } else {
        categories.value.push({ name: category, links: [entry] });
      }
      removeEmptyCategory(oldCategory);
    }

    await saveLinks();
  }

  /**
   * Delete a link entry, removing its category if it becomes empty
   */
  async function deleteLink(categoryName, id) {
    const category = findCategory(categoryName);
    if (!category) return;

    category.links = category.links.filter(l => l.id !== id);
    removeEmptyCategory(categoryName);

    await saveLinks();
  }

  /**
   * Move a link entry within or between categories (used by drag and drop).
   * @param {string} sourceCategory - Category the entry is dragged from
   * @param {string} id - Id of the dragged entry
   * @param {string} targetCategory - Category the entry is dropped into
   * @param {number} targetIndex - Drop position among the target category's entries
   */
  async function moveLink(sourceCategory, id, targetCategory, targetIndex) {
    const source = findCategory(sourceCategory);
    if (!source) return;

    const index = source.links.findIndex(l => l.id === id);
    if (index === -1) return;

    const [entry] = source.links.splice(index, 1);

    // When reordering within the same category, account for the removed item
    let insertIndex = targetIndex;
    if (sourceCategory === targetCategory && index < targetIndex) {
      insertIndex--;
    }

    let target = findCategory(targetCategory);
    if (!target) {
      target = { name: targetCategory, links: [] };
      categories.value.push(target);
    }

    const clampedIndex = Math.max(0, Math.min(insertIndex, target.links.length));
    target.links.splice(clampedIndex, 0, entry);

    if (sourceCategory !== targetCategory) {
      removeEmptyCategory(sourceCategory);
    }

    await saveLinks();
  }

  return {
    // State
    categories,
    error,
    categoryNames,

    // Methods
    loadLinks,
    saveLinks,
    addLink,
    updateLink,
    deleteLink,
    moveLink
  };
}
