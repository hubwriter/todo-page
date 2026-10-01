import { computed, ref } from 'vue';
import { loadLinks as apiLoadLinks, saveLinks as apiSaveLinks } from '../api/linksApi.js';
import { ConflictError } from '../api/resourceErrors.js';
import { createLinkId } from '../utils/linkUtils.js';
import { mergeLinks } from '../utils/linksMerge.js';
import { validateLinkCategories } from '../utils/linkValidation.js';
import { DEFAULT_LINK_CATEGORY } from '../constants.js';
import { useConflictAwareSave } from './useConflictAwareSave.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function prepareRecoveredCategories(categories) {
  if (!Array.isArray(categories)) return categories;
  return categories.map((category) => ({
    ...category,
    links: Array.isArray(category?.links)
      ? category.links.map((link) => ({
        ...link,
        id: typeof link?.id === 'string' && link.id ? link.id : createLinkId()
      }))
      : category?.links
  }));
}

function normalizeCategories(data) {
  if (!Array.isArray(data)) return [];
  const result = [];
  for (const category of data) {
    if (!category || typeof category.name !== 'string') continue;
    const name = category.name.trim();
    if (!name) continue;
    const cleanLinks = (Array.isArray(category.links) ? category.links : [])
      .filter((link) => link && typeof link.url === 'string')
      .map((link) => ({
        id: typeof link.id === 'string' && link.id ? link.id : createLinkId(),
        url: link.url,
        description: typeof link.description === 'string' ? link.description : ''
      }));
    const existing = result.find((categoryItem) => categoryItem.name === name);
    if (existing) existing.links.push(...cleanLinks);
    else result.push({ name, links: cleanLinks });
  }

  return result;
}

function snapshotFromResponse(response) {
  return response.invalid
    ? { invalid: true, rawContent: response.rawContent, categories: null }
    : { invalid: false, rawContent: response.rawContent, categories: normalizeCategories(response.categories) };
}

function mergeLinkSnapshots(base, current, other) {
  if (other.invalid) {
    const keepCurrent = 'Keep this tab’s valid Links changes';
    const conflict = {
      id: 'links-invalid-external',
      label: 'The saved links file contains invalid JSON',
      base: base?.invalid ? base.rawContent : 'Previously valid links',
      current: keepCurrent,
      other: other.rawContent,
      resolution: keepCurrent,
      resolved: false
    };
    return {
      conflicts: [conflict],
      requiresReplacementConfirmation: true,
      replacementConfirmationLabel: 'Replace the invalid links file with this valid resolution.',
      saveOptions: { replaceInvalid: true },
      assemble: (resolutions) => {
        const resolution = resolutions[0]?.resolution ?? keepCurrent;
        if (resolution === keepCurrent) return clone(current);
        try {
          return {
            invalid: false,
            rawContent: resolution,
            categories: prepareRecoveredCategories(JSON.parse(resolution))
          };
        } catch {
          return { invalid: true, rawContent: resolution, categories: null };
        }
      }
    };
  }
  const result = mergeLinks(
    base?.categories || [],
    current?.categories || [],
    other.categories || []
  );
  return {
    conflicts: result.conflicts,
    categories: result.categories
      ? { invalid: false, rawContent: '', categories: result.categories }
      : null,
    assemble: (resolutions) => ({
      invalid: false,
      rawContent: '',
      categories: result.assemble(resolutions)
    })
  };
}

export function useLinks() {
  const categories = ref([]);
  const loadError = ref('');
  const invalidContent = ref('');
  const invalidMessage = ref('');
  const acceptedValidSnapshotRevision = ref(0);

  const coordinator = useConflictAwareSave({
    resource: 'links',
    saveRemote: (snapshot, baseVersion, options) =>
      apiSaveLinks(snapshot.categories, baseVersion, options),
    merge: mergeLinkSnapshots,
    snapshotFromResponse,
    onCandidate: applySnapshot,
    onAccepted: acceptSnapshot,
    validate: (snapshot) => {
      return validateLinkCategories(snapshot?.categories);
    }
  });

  const error = computed({
    get: () => coordinator.error.value || loadError.value || coordinator.recoveryWarning.value,
    set: (value) => {
      loadError.value = value;
      if (!value) coordinator.error.value = '';
    }
  });

  const categoryNames = computed(() => {
    const names = categories.value.map((category) => category.name);
    if (!names.includes(DEFAULT_LINK_CATEGORY)) names.unshift(DEFAULT_LINK_CATEGORY);
    return names;
  });

  function applySnapshot(snapshot) {
    if (snapshot.invalid) {
      invalidContent.value = snapshot.rawContent;
      invalidMessage.value = 'links.json contains invalid JSON. Fix it below or explicitly replace it.';
      return snapshot;
    }
    categories.value = normalizeCategories(snapshot.categories);
    invalidContent.value = '';
    invalidMessage.value = '';
    return snapshot;
  }

  function acceptSnapshot(snapshot) {
    applySnapshot(snapshot);
    if (!snapshot.invalid) acceptedValidSnapshotRevision.value++;
    return snapshot;
  }

  async function loadLinks({ preserveLocal = false } = {}) {
    try {
      loadError.value = '';
      const response = await apiLoadLinks();
      if (!coordinator.version.value) return applySnapshot(coordinator.initialize(response));
      if (preserveLocal || coordinator.dirty.value || coordinator.resolving.value) {
        coordinator.noteExternalVersion(response.version);
        return coordinator.localCandidate.value;
      }
      return applySnapshot(coordinator.adopt(response));
    } catch (loadFailure) {
      loadError.value = loadFailure.userMessage
        || `Error loading links: ${loadFailure.message}`;
      console.error('Error loading links:', loadFailure);
      return null;
    }
  }

  async function saveCurrent(options = {}) {
    const snapshot = { invalid: false, rawContent: '', categories: clone(categories.value) };
    return coordinator.save(snapshot, options);
  }

  async function mutateAndSave(mutation) {
    const snapshot = {
      value: { invalid: false, rawContent: '', categories: clone(categories.value) },
      dirty: coordinator.dirty.value
    };
    mutation();
    try {
      return await saveCurrent();
    } catch (saveFailure) {
      if (saveFailure instanceof ConflictError || coordinator.preserveCandidateOnFailure.value) {
        applySnapshot(coordinator.localCandidate.value);
      } else {
        applySnapshot(snapshot.value);
        coordinator.restoreCandidate(snapshot.value, snapshot.dirty);
      }
      throw saveFailure;
    }
  }

  function findCategory(name) {
    return categories.value.find((category) => category.name === name);
  }

  function removeEmptyCategory(name) {
    const index = categories.value.findIndex((category) => category.name === name);
    if (index !== -1 && categories.value[index].links.length === 0) {
      categories.value.splice(index, 1);
    }
  }

  async function addLink({ category, url, description }) {
    return mutateAndSave(() => {
      const entry = { id: createLinkId(), url, description };
      const existing = findCategory(category);
      if (existing) existing.links.unshift(entry);
      else categories.value.push({ name: category, links: [entry] });
    });
  }

  async function updateLink(id, oldCategory, update) {
    return mutateAndSave(() => {
      const sourceCategory = findCategory(oldCategory);
      if (!sourceCategory) return;
      const index = sourceCategory.links.findIndex((link) => link.id === id);
      if (index === -1) return;
      const entry = sourceCategory.links[index];
      entry.url = update.url;
      entry.description = update.description;
      if (update.category !== oldCategory) {
        sourceCategory.links.splice(index, 1);
        const target = findCategory(update.category);
        if (target) target.links.unshift(entry);
        else categories.value.push({ name: update.category, links: [entry] });
        removeEmptyCategory(oldCategory);
      }
    });
  }

  async function deleteLink(categoryName, id) {
    return mutateAndSave(() => {
      const category = findCategory(categoryName);
      if (!category) return;
      category.links = category.links.filter((link) => link.id !== id);
      removeEmptyCategory(categoryName);
    });
  }

  async function moveLink(sourceCategory, id, targetCategory, targetIndex) {
    return mutateAndSave(() => {
      const source = findCategory(sourceCategory);
      if (!source) return;
      const index = source.links.findIndex((link) => link.id === id);
      if (index === -1) return;
      const [entry] = source.links.splice(index, 1);
      let insertIndex = targetIndex;
      if (sourceCategory === targetCategory && index < targetIndex) insertIndex--;
      let target = findCategory(targetCategory);
      if (!target) {
        target = { name: targetCategory, links: [] };
        categories.value.push(target);
      }
      target.links.splice(Math.max(0, Math.min(insertIndex, target.links.length)), 0, entry);
      if (sourceCategory !== targetCategory) removeEmptyCategory(sourceCategory);
    });
  }

  async function replaceInvalidRaw(rawContent) {
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (parseError) {
      invalidMessage.value = `Invalid JSON: ${parseError.message}`;
      return null;
    }
    if (!Array.isArray(parsed)) {
      invalidMessage.value = 'The recovered JSON must be an array of link categories.';
      return null;
    }
    const recovered = prepareRecoveredCategories(parsed);
    const validation = validateLinkCategories(recovered);
    if (!validation.valid) {
      invalidMessage.value = validation.error;
      return null;
    }
    categories.value = clone(recovered);
    return saveCurrent({ replaceInvalid: true });
  }

  return {
    categories,
    error,
    categoryNames,
    version: coordinator.version,
    dirty: coordinator.dirty,
    resolving: coordinator.resolving,
    externalChange: coordinator.externalChange,
    unresolved: coordinator.unresolved,
    contention: coordinator.contention,
    invalidContent,
    invalidMessage,
    acceptedValidSnapshotRevision,
    loadLinks,
    saveLinks: saveCurrent,
    addLink,
    updateLink,
    deleteLink,
    moveLink,
    replaceInvalidRaw,
    noteExternalVersion: coordinator.noteExternalVersion
  };
}
