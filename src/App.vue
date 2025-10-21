<template>
  <div class="todo-app" @click="closeContextMenu">
    <h1>To do</h1>

    <!-- Tabs -->
    <div class="tabs" role="tablist">
      <button
        @click="activeTab = 'tasks'"
        :class="{ active: activeTab === 'tasks' }"
        role="tab"
        :aria-selected="activeTab === 'tasks'"
        aria-controls="tasks-panel"
      >
        Tasks
      </button>
      <button
        @click="activeTab = 'editor'"
        :class="{ active: activeTab === 'editor' }"
        role="tab"
        :aria-selected="activeTab === 'editor'"
        aria-controls="editor-panel"
      >
        Markdown
      </button>
      <button
        @click="activeTab = 'notes'"
        :class="{ active: activeTab === 'notes' }"
        role="tab"
        :aria-selected="activeTab === 'notes'"
        aria-controls="notes-panel"
      >
        Notes
      </button>
    </div>

    <!-- Tasks Tab -->
    <div v-show="activeTab === 'tasks'" id="tasks-panel" role="tabpanel">
      <!-- Add/Edit Task Form -->
      <div class="add-task">
        <textarea
          ref="taskInputRef"
          v-model="newTask"
          :placeholder="taskInputPlaceholder"
          :aria-label="editState.isEditing ? 'Edit task' : 'New task'"
          rows="3"
          @keydown="handleKeyDown"
        ></textarea>
        <div class="button-group">
          <button
            @click="handleAddOrSave"
            :aria-label="editState.isEditing ? 'Save edited task' : 'Add task'"
            class="btn-primary"
            :disabled="!newTask.trim()"
          >
            {{ editState.isEditing ? 'Save' : 'Add' }}
          </button>
          <button
            @click="handleCancel"
            aria-label="Cancel editing"
            class="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>

      <div class="error" v-if="error" role="alert">{{ error }}</div>

      <!-- Task Lists -->
      <div class="lists-container">
        <TaskList
          list-type="Priority"
          :tasks="priorityTasks"
          @dragstart="onDragStart"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
          @checkbox-change="handleCheckboxChange"
        />

        <TaskList
          list-type="Other"
          :tasks="otherTasks"
          @dragstart="onDragStart"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
          @checkbox-change="handleCheckboxChange"
        />

        <TaskList
          list-type="Done"
          :tasks="doneTasks"
          @dragstart="onDragStart"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
          @checkbox-change="handleCheckboxChange"
        />
      </div>

      <!-- Context Menu -->
      <ContextMenu
        :show="contextMenu.show"
        :x="contextMenu.x"
        :y="contextMenu.y"
        :list-type="contextMenu.listType"
        @close="closeContextMenu"
        @edit="handleEditFromMenu"
        @move-to-other="handleMoveToOther"
        @move-to-priority="handleMoveToPriority"
        @delete="handleDelete"
      />
    </div>

    <!-- Markdown Editor Tab -->
    <div v-show="activeTab === 'editor'" id="editor-panel" role="tabpanel">
      <div class="markdown-editor">
        <h2>Markdown Editor</h2>
        <textarea
          v-model="markdownContent"
          aria-label="Markdown editor"
        ></textarea>
      </div>
    </div>

    <!-- Notes Tab -->
    <div v-show="activeTab === 'notes'" id="notes-panel" role="tabpanel">
      <div class="notes-content">
        <h2>About</h2>

        <h3>Source File</h3>
        <p>The todo data is stored in:</p>
        <p><code>/Users/alistair/work-stuff/tech-writing/todo.md</code></p>
        <p>To edit this file <a :href="`vscode://file/Users/alistair/work-stuff/tech-writing/todo.md`">click here</a> or press <kbd>control</kbd>+<kbd>command</kbd>+<kbd>-</kbd></p>

        <h3>Project Information</h3>
        <p>Code repository: <a href="https://github.com/hubwriter/todo-page" target="_blank" rel="noopener noreferrer">https://github.com/hubwriter/todo-page</a></p>
        <p>Created using Copilot Agent mode in VS Code on 16 October 2025.</p>

        <h3>Technical Overview</h3>
        <p><strong>Technologies:</strong></p>
        <ul>
          <li><strong>Frontend:</strong> Vue 3 (Composition API), Vite</li>
          <li><strong>Backend:</strong> Node.js, Express</li>
          <li><strong>Markdown:</strong> Marked.js for rendering</li>
          <li><strong>Storage:</strong> Plain markdown file with file-watching</li>
        </ul>

        <p><strong>Deployment:</strong></p>
        <ul>
          <li>Server runs on port 3000 (integrated Express + Vite)</li>
          <li>Auto-starts on login via macOS LaunchAgent (<code>com.user.todo-app</code>)</li>
          <li>Configuration via <code>config.json</code> in project root</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { marked } from 'marked';
import TaskList from './components/TaskList.vue';
import ContextMenu from './components/ContextMenu.vue';
import { useTasks } from './composables/useTasks.js';
import { useContextMenu } from './composables/useContextMenu.js';
import { useTaskEditor } from './composables/useTaskEditor.js';
import { setupFileWatcher, saveTodoContent } from './api/todoApi.js';
import { generateMarkdownFromTasks, removeDateFromTask } from './utils/markdownUtils.js';
import { calculateDropPosition, getTaskList } from './utils/taskUtils.js';
import { AUTO_SAVE_DELAY_MS } from './constants.js';

// Configure marked for inline rendering
marked.setOptions({
  breaks: true,
  gfm: true
});

// State
const activeTab = ref('tasks');
const markdownContent = ref('');
const draggedItem = ref(null);
const isSavingLocally = ref(false); // Flag to prevent file watcher reload during our saves
const taskInputRef = ref(null); // Reference to the task input textarea
const hasInitialFocusBeenApplied = ref(false); // Track if initial auto-focus has been applied
let eventSource = null;
let autoSaveTimer = null;

// Composables
const {
  priorityTasks,
  otherTasks,
  doneTasks,
  error,
  loadTasks,
  saveTasks,
  completeTask,
  uncompleteTask,
  deleteTask,
  moveTaskBetweenSections,
  getTaskLists
} = useTasks();

const {
  contextMenu,
  showContextMenu,
  closeContextMenu,
  handleEscKey,
  getMenuContext
} = useContextMenu();

const {
  newTask,
  editingTask,
  startEdit,
  cancelEdit,
  getEditState,
  scrollToTask
} = useTaskEditor();

// Computed
const editState = computed(() => getEditState());

const taskInputPlaceholder = computed(() => {
  return editState.value.isEditing
    ? 'Editing task... (Cmd+Enter to save to original position)'
    : 'Add new task to Priority... (Cmd+Enter to submit)';
});

// Wrapper for saveTasks that prevents file watcher reload
async function saveTasksWithoutReload() {
  isSavingLocally.value = true;
  try {
    await saveTasks();
    // Wait a bit for the file watcher event to be processed and ignored
    await new Promise(resolve => setTimeout(resolve, 500));
  } finally {
    isSavingLocally.value = false;
  }
}

// Task Management
async function handleAddOrSave() {
  if (!newTask.value.trim()) return;

  const taskText = newTask.value.trim();

  if (editState.value.isEditing) {
    // Editing mode: restore to original position
    const { originalList, originalIndex } = editState.value;

    // Insert the edited task at its original position
    const lists = getTaskLists();
    const targetList = getTaskList(originalList, lists);
    targetList.splice(originalIndex, 0, taskText);

    await saveTasksWithoutReload();
    scrollToTask(originalList, originalIndex);
    cancelEdit();
  } else {
    // Normal add: add to top of Priority
    priorityTasks.value.unshift(taskText);
    newTask.value = '';
    await saveTasksWithoutReload();
  }
}

async function handleCancel() {
  if (editState.value.isEditing) {
    // Restore original task
    const { originalList, originalIndex, originalText } = editState.value;
    if (originalText) {
      const lists = getTaskLists();
      const targetList = getTaskList(originalList, lists);
      targetList.splice(originalIndex, 0, originalText);
      await saveTasksWithoutReload();
      scrollToTask(originalList, originalIndex);
    }
  }
  cancelEdit();
}

function handleKeyDown(event) {
  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    handleAddOrSave();
  }
}

async function handleCheckboxChange(listType, index) {
  if (listType === 'Done') {
    await uncompleteTask(index);
    // Scroll to show the task in its new position at the top of Priority list
    scrollToTask('Priority', 0);
  } else {
    await completeTask(listType, index);
  }
}

// Drag and Drop
function onDragStart(event, section, index) {
  draggedItem.value = { section, index };
  event.dataTransfer.effectAllowed = 'move';
}

async function onDrop(event, targetSection) {
  event.preventDefault();
  if (!draggedItem.value || targetSection === 'Done') return;

  const { section: sourceSection, index: sourceIndex } = draggedItem.value;
  const listElement = event.currentTarget;
  let targetIndex = calculateDropPosition(event, listElement);

  // Adjust target index if moving within same section
  if (sourceSection === targetSection && sourceIndex < targetIndex) {
    targetIndex--;
  }

  await moveTaskBetweenSections(sourceSection, targetSection, sourceIndex, targetIndex);
  draggedItem.value = null;
}

// Context Menu Handlers
function handleShowContextMenu(event, listType, index, taskText) {
  showContextMenu(event, listType, index, taskText);
}

async function handleEditFromMenu() {
  const { listType, taskIndex, taskText } = getMenuContext();

  // Remove task from list
  const lists = getTaskLists();
  const sourceList = getTaskList(listType, lists);
  sourceList.splice(taskIndex, 1);

  // Start editing
  startEdit(listType, taskIndex, taskText);
  closeContextMenu();

  // Save without triggering a reload
  await saveTasksWithoutReload();
}

async function handleDelete() {
  const { listType, taskIndex } = getMenuContext();
  closeContextMenu();
  await deleteTask(listType, taskIndex);
}

async function handleMoveToOther() {
  const { taskIndex } = getMenuContext();
  closeContextMenu();
  await moveTaskBetweenSections('Priority', 'Other', taskIndex, 0);
  scrollToTask('Other', 0);
}

async function handleMoveToPriority() {
  const { taskIndex } = getMenuContext();
  closeContextMenu();
  await moveTaskBetweenSections('Other', 'Priority', taskIndex, 0);
  scrollToTask('Priority', 0);
}

// Markdown Editor
async function saveMarkdown() {
  try {
    error.value = '';
    await saveTodoContent(markdownContent.value);
    await loadTasks();
  } catch (err) {
    error.value = `Error saving markdown: ${err.message}`;
    console.error('Error saving markdown:', err);
  }
}

// Auto-save markdown content with debouncing
watch(markdownContent, (newValue, oldValue) => {
  if (newValue !== oldValue && activeTab.value === 'editor') {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(saveMarkdown, AUTO_SAVE_DELAY_MS);
  }
});

// Watch tasks for markdown content sync
watch([priorityTasks, otherTasks, doneTasks], () => {
  if (activeTab.value !== 'editor') {
    markdownContent.value = generateMarkdownFromTasks(
      priorityTasks.value,
      otherTasks.value,
      doneTasks.value
    );
  }
}, { deep: true });

// Lifecycle
onMounted(async () => {
  const content = await loadTasks();
  markdownContent.value = content;

  // Setup file watcher with a wrapper that checks if we're saving locally
  eventSource = setupFileWatcher(() => {
    // Only reload if we're not in the middle of a local save operation
    if (!isSavingLocally.value) {
      console.log('External file change detected, reloading...');
      loadTasks();
    } else {
      console.log('Skipping reload - local save in progress');
    }
  });

  window.addEventListener('keydown', handleEscKey);

  // Auto-focus the task input on initial load
  // FR-001: Auto-focus on initial load
  // FR-003: Respect existing user focus (don't override if editing)
  // FR-002: Only apply on initial load (hasInitialFocusBeenApplied flag)
  if (!hasInitialFocusBeenApplied.value && !editState.value.isEditing) {
    // Use nextTick to ensure DOM is fully rendered
    await new Promise(resolve => setTimeout(resolve, 0));
    if (taskInputRef.value && activeTab.value === 'tasks') {
      taskInputRef.value.focus();
      hasInitialFocusBeenApplied.value = true;
    }
  }
});

onUnmounted(() => {
  if (eventSource) eventSource.close();
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  window.removeEventListener('keydown', handleEscKey);
});
</script>

<style scoped>
.todo-app {
  width: 100%;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.tabs button {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 6px 6px 0 0;
  background: transparent;
  cursor: pointer;
  font-size: 0.95rem;
  color: rgba(0, 0, 0, 0.6);
  transition: all 0.2s;
  position: relative;
  bottom: -1px;
  outline: none;
}

.tabs button:focus {
  outline: none;
}

.tabs button.active {
  color: rgba(0, 0, 0, 0.9);
  background: #646cff;
  color: white;
}

.tabs button:hover:not(.active) {
  background: rgba(100, 108, 255, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

.add-task {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  align-items: flex-start;
  transition: all 0.3s ease;
}

.add-task textarea {
  flex: 1;
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}

.error {
  color: #ff4444;
  padding: 0.4rem;
  margin-bottom: 0.8rem;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
}

.lists-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.markdown-editor {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  height: calc(100vh - 180px);
}

.markdown-editor h2 {
  margin-top: 0;
  margin-bottom: 0.6rem;
}

.markdown-editor textarea {
  width: 100%;
  flex: 1;
  font-family: 'Courier New', monospace;
  resize: none;
  min-height: 400px;
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

.btn-primary:disabled {
  background-color: #9ca3af !important;
  border-color: #6b7280 !important;
  cursor: not-allowed;
  opacity: 0.6;
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

.btn-secondary:disabled {
  background-color: #9ca3af !important;
  border-color: #6b7280 !important;
  cursor: not-allowed;
  opacity: 0.6;
}

.notes-content {
  margin-top: 0.5rem;
  max-width: 800px;
}

.notes-content h2 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.notes-content h3 {
  font-size: 1.2em;
  margin-top: 1.5rem;
  margin-bottom: 0.6rem;
  color: #646cff;
}

.notes-content p {
  margin: 0.5rem 0;
  line-height: 1.6;
}

.notes-content ul {
  margin: 0.5rem 0;
  padding-left: 1.5rem;
  line-height: 1.8;
}

.notes-content li {
  margin: 0.3rem 0;
}

.notes-content code {
  background-color: #f5f5f5;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
  color: #d63384;
}

.notes-content kbd {
  background-color: #f5f5f5;
  border: 1px solid #ccc;
  border-radius: 3px;
  padding: 0.2em 0.5em;
  font-family: 'Courier New', monospace;
  font-size: 0.85em;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}

.notes-content a {
  color: #0066cc !important;
  text-decoration: underline !important;
}

.notes-content a:visited {
  color: #0066cc !important;
}

.notes-content a:hover {
  color: #0052a3 !important;
}
</style>
