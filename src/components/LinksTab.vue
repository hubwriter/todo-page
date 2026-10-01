<template>
  <div class="links-tab">
    <div v-if="unresolved || externalChange || contention" class="conflict-banner" role="status">
      <strong>Changes saved elsewhere.</strong>
      {{ contention || 'Your Links edits are preserved. Save again to merge or resolve them.' }}
    </div>

    <div class="error" v-if="error" role="alert">{{ error }}</div>

    <section v-if="invalidContent" class="invalid-links" aria-labelledby="invalid-links-heading">
      <h2 id="invalid-links-heading">Repair links.json</h2>
      <p>{{ invalidMessage }}</p>
      <textarea
        v-model="recoveryText"
        rows="12"
        aria-label="Invalid links JSON"
        @input="handleRecoveryInput"
      ></textarea>
      <button type="button" class="btn-primary" @click="handleReplaceInvalid">
        Validate and replace invalid file
      </button>
    </section>

    <template v-else>
    <!-- Add/Edit Link Form -->
    <div class="add-link">
      <div class="link-fields">
        <div class="field">
          <label for="link-category">Category</label>
          <div class="category-combo" @click.stop>
            <input
              id="link-category"
              ref="categoryInput"
              type="text"
              v-model="form.category"
              v-edit-history="editSession"
              placeholder="e.g. GitHub"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="link-category-list"
              :aria-expanded="showCategoryDropdown"
              @keydown="handleKeyDown"
            />
            <button
              type="button"
              class="category-toggle"
              aria-haspopup="listbox"
              :aria-expanded="showCategoryDropdown"
              aria-label="Show existing categories"
              @click="toggleCategoryDropdown"
            >▾</button>
            <ul
              v-if="showCategoryDropdown"
              id="link-category-list"
              class="category-dropdown"
              role="listbox"
            >
              <li
                v-for="name in categoryNames"
                :key="name"
                role="option"
                :aria-selected="name === form.category"
              >
                <button
                  type="button"
                  class="category-option"
                  :class="{ 'is-selected': name === form.category }"
                  @click="selectCategory(name)"
                >{{ name }}</button>
              </li>
            </ul>
          </div>
        </div>

        <div class="field">
          <label for="link-url">URL</label>
          <input
            id="link-url"
            type="text"
            v-model="form.url"
            v-edit-history="editSession"
            placeholder="https://example.com"
            autocomplete="off"
            @keydown="handleKeyDown"
          />
        </div>

        <div class="field">
          <label for="link-description">Description</label>
          <textarea
            id="link-description"
            v-model="form.description"
            v-edit-history="editSession"
            placeholder="A short description of the link"
            rows="2"
            @keydown="handleKeyDown"
            @paste="handleMarkdownPaste"
          ></textarea>
        </div>
      </div>

      <div class="button-group">
        <button
          @click="handleAddOrSave"
          class="btn-primary"
          :aria-label="isEditing ? 'Save edited link' : 'Add link'"
        >
          {{ isEditing ? 'Save' : 'Add' }}
        </button>
        <button
          @click="handleCancel"
          class="btn-secondary"
          aria-label="Cancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Category Lists -->
    <template v-if="categories.length">
      <div class="links-toolbar">
        <button type="button" class="expand-toggle" @click="toggleExpandAll">
          {{ expandAll ? 'Collapse all' : 'Expand all' }}
        </button>
        <span class="expand-hint">(press spacebar to toggle)</span>
      </div>
      <div class="links-container">
        <LinkList
          v-for="category in categories"
          :key="category.name"
          :category="category.name"
          :links="category.links"
          :expanded="forceExpanded || (contextMenu.show && contextMenu.category === category.name)"
          @dragstart="onDragStart"
          @dragend="onDragEnd"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
        />
      </div>
    </template>
    <p v-else class="empty-hint">
      No links yet. Fill in a category, URL and description above, then click "Add".
    </p>

    <!-- Context Menu -->
    <LinkContextMenu
      :show="contextMenu.show"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="closeContextMenu"
      @edit="handleEditFromMenu"
      @delete="handleDeleteFromMenu"
    />
    </template>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted, onUnmounted, watch } from 'vue';
import LinkList from './LinkList.vue';
import LinkContextMenu from './LinkContextMenu.vue';
import { useLinks } from '../composables/useLinks.js';
import { normalizeUrl } from '../utils/linkUtils.js';
import { handleFormattingShortcut } from '../utils/formattingShortcuts.js';
import { handleMarkdownPaste } from '../utils/markdownPaste.js';
import { vEditHistory } from '../utils/editHistory.js';
import { DEFAULT_LINK_CATEGORY } from '../constants.js';

const props = defineProps({
  // Whether the Links tab is currently displayed (enables the spacebar shortcut)
  active: {
    type: Boolean,
    default: false
  }
});

const {
  categories,
  error,
  categoryNames,
  version,
  dirty,
  resolving,
  externalChange,
  unresolved,
  contention,
  invalidContent,
  invalidMessage,
  acceptedValidSnapshotRevision,
  loadLinks,
  addLink,
  updateLink,
  deleteLink,
  moveLink,
  replaceInvalidRaw,
  noteExternalVersion
} = useLinks();
const RECOVERY_DRAFT_KEY = 'todo-page-links-recovery';
const recoveryText = ref('');
const recoveryDirty = ref(false);

function clearRecoveryDraft() {
  recoveryText.value = '';
  recoveryDirty.value = false;
  sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
}

watch(invalidContent, (value) => {
  if (recoveryDirty.value) return;
  const stored = sessionStorage.getItem(RECOVERY_DRAFT_KEY);
  if (value && stored) {
    try {
      const draft = JSON.parse(stored);
      if (typeof draft.text === 'string') {
        recoveryText.value = draft.text;
        recoveryDirty.value = draft.text !== value;
        return;
      }
    } catch {
      sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
    }
  }
  recoveryText.value = value;
}, { immediate: true });
watch(acceptedValidSnapshotRevision, clearRecoveryDraft);

// Add/edit form state
const form = reactive({
  category: DEFAULT_LINK_CATEGORY,
  url: '',
  description: ''
});

// When set, the form is editing an existing entry: { id, category }
const editing = ref(null);
const editSession = ref(0);
const categoryInput = ref(null);
const isEditing = computed(() => editing.value !== null);

// Category dropdown state
const showCategoryDropdown = ref(false);

// Drag and drop state
const draggedLink = ref(null);

// Collapse/expand state. Categories are expanded by default; when collapsed a
// category expands on hover. Dragging temporarily expands all categories so
// entries can be dropped into any of them.
const expandAll = ref(true);
const isDragging = ref(false);
const forceExpanded = computed(() => expandAll.value || isDragging.value);

// Context menu state
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  category: '',
  id: ''
});

function resetForm() {
  editSession.value++;
  form.category = DEFAULT_LINK_CATEGORY;
  form.url = '';
  form.description = '';
  editing.value = null;
  error.value = '';
}

async function handleAddOrSave() {
  const category = form.category.trim();
  const url = form.url.trim();
  // Collapse any newlines so the description stays on a single line
  const description = form.description.replace(/\s*[\r\n]+\s*/g, ' ').trim();

  if (!category || !url || !description) {
    error.value = 'Please complete all three fields: Category, URL and Description.';
    return;
  }

  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    error.value = 'Please enter a valid URL, for example https://example.com';
    return;
  }

  error.value = '';

  try {
    if (editing.value) {
      await updateLink(editing.value.id, editing.value.category, {
        category,
        url: normalizedUrl,
        description
      });
    } else {
      await addLink({ category, url: normalizedUrl, description });
    }
  } catch {
    return;
  }

  resetForm();
}

function handleCancel() {
  resetForm();
}

function toggleCategoryDropdown() {
  showCategoryDropdown.value = !showCategoryDropdown.value;
}

function selectCategory(name) {
  const input = categoryInput.value;
  input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertReplacementText', bubbles: true }));
  input.value = name;
  input.setSelectionRange(name.length, name.length);
  input.dispatchEvent(new InputEvent('input', { inputType: 'insertReplacementText', bubbles: true }));
  showCategoryDropdown.value = false;
}

function closeCategoryDropdown() {
  showCategoryDropdown.value = false;
}

function handleKeyDown(event) {
  handleFormattingShortcut(event);
  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    handleAddOrSave();
  }
}

function toggleExpandAll() {
  expandAll.value = !expandAll.value;
}

// Drag and Drop
function onDragStart(event, category, id) {
  draggedLink.value = { category, id };
  isDragging.value = true;
  event.dataTransfer.effectAllowed = 'move';
}

async function onDrop(event, targetCategory, targetIndex) {
  event.preventDefault();
  isDragging.value = false;
  if (!draggedLink.value) return;

  const { category: sourceCategory, id } = draggedLink.value;
  await moveLink(sourceCategory, id, targetCategory, targetIndex);
  draggedLink.value = null;
}

function onDragEnd() {
  isDragging.value = false;
  draggedLink.value = null;
}

// Context Menu
function handleShowContextMenu(event, category, id) {
  // Let clicks on the link itself follow the link instead of opening the menu
  if (event.target.tagName === 'A') return;

  event.preventDefault();
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    category,
    id
  };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

function findLink(categoryName, id) {
  const category = categories.value.find(c => c.name === categoryName);
  if (!category) return null;
  return category.links.find(l => l.id === id) || null;
}

function handleEditFromMenu() {
  const { category, id } = contextMenu.value;
  const entry = findLink(category, id);
  closeContextMenu();
  if (!entry) return;

  editSession.value++;
  form.category = category;
  form.url = entry.url;
  form.description = entry.description;
  editing.value = { id, category };
  error.value = '';
}

async function handleDeleteFromMenu() {
  const { category, id } = contextMenu.value;
  closeContextMenu();
  const deletingEditedLink = editing.value?.id === id;
  try {
    await deleteLink(category, id);
  } catch {
    return;
  }
  if (deletingEditedLink) resetForm();
}

async function handleReplaceInvalid() {
  try {
    await replaceInvalidRaw(recoveryText.value);
  } catch (replacementFailure) {
    recoveryDirty.value = true;
    sessionStorage.setItem(RECOVERY_DRAFT_KEY, JSON.stringify({
      text: recoveryText.value
    }));
    console.error('Error replacing invalid links file:', replacementFailure);
    error.value = replacementFailure.userMessage
      || error.value
      || 'Could not replace links.json. Your repaired JSON is still here; check your connection and try again.';
  }
}

function handleRecoveryInput() {
  recoveryDirty.value = recoveryText.value !== invalidContent.value;
  if (!recoveryDirty.value) {
    sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
    return;
  }
  sessionStorage.setItem(RECOVERY_DRAFT_KEY, JSON.stringify({
    text: recoveryText.value
  }));
}

function hasUnsavedForm() {
  return isEditing.value ||
    form.url.trim() !== '' ||
    form.description.trim() !== '' ||
    form.category.trim() !== DEFAULT_LINK_CATEGORY;
}

function handleResourceChange(event) {
  const notification = event.detail;
  if (notification.resource !== 'links' && !notification.resync) return;
  if (notification.version && notification.version === version.value) return;
  if (dirty.value || resolving.value || hasUnsavedForm() || recoveryDirty.value) {
    noteExternalVersion(notification.version);
  } else {
    loadLinks();
  }
}

function handleBeforeUnload(event) {
  if (!hasUnsavedForm() && !recoveryDirty.value && !dirty.value && !resolving.value) return;
  event.preventDefault();
  event.returnValue = '';
}

function isTextFieldFocused(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable === true;
}

function handleGlobalKeyDown(event) {
  // Escape closes the context menu / category dropdown
  if (event.key === 'Escape') {
    if (contextMenu.value.show) closeContextMenu();
    if (showCategoryDropdown.value) closeCategoryDropdown();
    return;
  }

  // Spacebar toggles Expand all / Collapse all while the Links tab is showing
  // and the user is not typing in a field
  if ((event.key === ' ' || event.key === 'Spacebar') && props.active && !isTextFieldFocused(event.target)) {
    // The toggle button already toggles itself when activated with Space, so
    // don't handle it here as well (that would double-toggle).
    if (event.target && event.target.classList && event.target.classList.contains('expand-toggle')) {
      return;
    }
    event.preventDefault();
    toggleExpandAll();
  }
}

onMounted(() => {
  loadLinks();
  window.addEventListener('keydown', handleGlobalKeyDown);
  window.addEventListener('click', closeCategoryDropdown);
  window.addEventListener('resource-version-change', handleResourceChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
  window.removeEventListener('click', closeCategoryDropdown);
  window.removeEventListener('resource-version-change', handleResourceChange);
  window.removeEventListener('beforeunload', handleBeforeUnload);
});
</script>

<style scoped>
.links-tab {
  width: 100%;
}

.conflict-banner,
.invalid-links {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e0a800;
  border-radius: 6px;
  background: #fff8db;
  color: #5c4400;
}

.invalid-links textarea {
  width: 100%;
  margin-bottom: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.add-link {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  align-items: flex-start;
}

.link-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 1rem;
}

.field label {
  width: 90px;
  flex-shrink: 0;
  font-weight: 500;
  color: #213547;
}

.field input,
.field textarea {
  flex: 1;
  min-width: 0;
  font-family: inherit;
}

.field textarea {
  resize: vertical;
  min-height: 48px;
}

.category-combo {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  gap: 0.25rem;
}

.category-combo input {
  flex: 1;
  min-width: 0;
}

.category-toggle {
  flex-shrink: 0;
  padding: 0 0.7rem;
  background-color: #f9f9f9;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.7rem;
  color: #213547;
  display: flex;
  align-items: center;
}

.category-toggle:hover {
  border-color: #646cff;
}

.category-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: #ffffff;
  border: 1px solid #d0d7de;
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 20;
  max-height: 220px;
  overflow-y: auto;
}

.category-option {
  width: 100%;
  padding: 6px 12px;
  border: none;
  border-radius: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 400;
  color: #213547;
}

.category-option:hover {
  background-color: #f6f8fa;
  border-color: transparent;
}

.category-option.is-selected {
  font-weight: 600;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.btn-primary {
  background-color: #22c55e !important;
  color: white !important;
  border: 1px solid #16a34a !important;
}

.btn-primary:hover:not(:disabled) {
  background-color: #16a34a !important;
  border-color: #15803d !important;
}

.btn-secondary {
  background-color: #6c757d !important;
  color: white !important;
  border: 1px solid #5a6268 !important;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #5a6268 !important;
  border-color: #545b62 !important;
}

.error {
  color: #ff4444;
  padding: 0.4rem;
  margin-bottom: 0.8rem;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
}

.links-toolbar {
  margin-bottom: 0.25rem;
}

.expand-hint {
  margin-left: 0.5rem;
  font-size: 0.85rem;
  color: rgba(0, 0, 0, 0.5);
}

.expand-toggle {
  padding: 0;
  border: none;
  background: none;
  color: #0066cc;
  text-decoration: underline;
  cursor: pointer;
  font-size: 0.95rem;
}

.expand-toggle:hover {
  color: #0052a3;
  border-color: transparent;
}

/* No focus ring after a mouse click, but keep one for keyboard users */
.expand-toggle:focus {
  outline: none;
}

.expand-toggle:focus-visible {
  outline: 2px solid #646cff;
  outline-offset: 2px;
  border-radius: 2px;
}

.links-container {
  display: flex;
  flex-direction: column;
}

.empty-hint {
  color: rgba(0, 0, 0, 0.6);
  font-style: italic;
}
</style>
