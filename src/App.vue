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
        About
      </button>
      <button
        @click="activeTab = 'backups'"
        :class="{ active: activeTab === 'backups' }"
        role="tab"
        :aria-selected="activeTab === 'backups'"
        aria-controls="backups-panel"
      >
        Backups
      </button>
      <button
        @click="activeTab = 'links'"
        :class="{ active: activeTab === 'links' }"
        role="tab"
        :aria-selected="activeTab === 'links'"
        aria-controls="links-panel"
      >
        Links
      </button>
    </div>

    <div
      v-if="backupRecoveryDraft && !backupPreview"
      class="recovery-banner"
      role="status"
    >
      <div>
        <strong>Unsaved changes are available.</strong>
        Restore the local draft that was kept when the backup replaced your tasks.
      </div>
      <div class="recovery-actions">
        <button
          @click="handleRestoreBackupDraft"
          class="btn-primary"
          aria-label="Restore unsaved changes"
        >
          Restore unsaved changes
        </button>
        <button
          @click="handleDiscardBackupDraft"
          class="btn-secondary"
          aria-label="Discard saved draft"
        >
          Discard saved draft
        </button>
      </div>
    </div>

    <!-- Tasks Tab -->
    <div v-show="activeTab === 'tasks'" id="tasks-panel" role="tabpanel">
      <!-- Backup preview: read-only view of a selected backup -->
      <template v-if="backupPreview">
        <div class="backup-banner" role="alert">
          <p>
            You are viewing a <strong>backup</strong> from
            <strong>{{ backupPreviewLabel }}</strong>. This is read-only.
          </p>
          <p>
            Using this backup will replace your current tasks and
            <strong>lose any changes made since this backup was taken</strong>.
          </p>
          <div class="button-group">
            <button
              @click="handleUseBackup"
              class="btn-primary"
              aria-label="Use this backup"
            >
              Use this backup
            </button>
            <button
              @click="handleCancelBackup"
              class="btn-secondary"
              aria-label="Cancel backup preview"
            >
              Cancel
            </button>
          </div>
        </div>

        <div class="error" v-if="error" role="alert">{{ error }}</div>

        <div class="lists-container">
          <TaskList list-type="Priority" :tasks="backupPreview.priority" :read-only="true" />
          <TaskList list-type="Other" :tasks="backupPreview.other" :read-only="true" />
          <TaskList list-type="Done" :tasks="backupPreview.done" :read-only="true" />
        </div>
      </template>

      <!-- Normal (editable) tasks view -->
      <template v-else>
      <div v-if="unresolved || externalChange || contention" class="conflict-banner" role="status">
        <strong>Changes saved elsewhere.</strong>
        {{ contention || 'Your local edits are preserved. Save again to merge or resolve them.' }}
      </div>
      <!-- Add/Edit Task Form -->
      <div class="add-task">
        <textarea
          ref="taskInputRef"
          v-model="newTask"
          v-edit-history="editingTask"
          :placeholder="taskInputPlaceholder"
          :aria-label="editState.isEditing ? 'Edit task' : 'New task'"
          rows="3"
          @keydown="handleKeyDown"
          @paste="handleMarkdownPaste"
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
          @edit-task="handleEditTask"
          @checkbox-change="handleCheckboxChange"
        />

        <TaskList
          list-type="Other"
          :tasks="otherTasks"
          @dragstart="onDragStart"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
          @edit-task="handleEditTask"
          @checkbox-change="handleCheckboxChange"
        />

        <TaskList
          list-type="Done"
          :tasks="doneTasks"
          @dragstart="onDragStart"
          @drop="onDrop"
          @show-context-menu="handleShowContextMenu"
          @edit-task="handleEditTask"
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
      </template>
    </div>

    <!-- Markdown Editor Tab -->
    <div v-show="activeTab === 'editor'" id="editor-panel" role="tabpanel">
      <div class="markdown-editor">
        <h2>Markdown Editor</h2>
        <textarea
          v-model="markdownContent"
          v-edit-history
          aria-label="Markdown editor"
          @input="handleMarkdownInput"
          @keydown="handleFormattingShortcut"
          @paste="handleMarkdownPaste"
        ></textarea>
      </div>
    </div>

    <!-- Notes Tab -->
    <div v-show="activeTab === 'notes'" id="notes-panel" role="tabpanel">
      <div class="notes-content">
        <h2>About</h2>

        <p>
          This is a personal to-do app for keeping track of tasks and useful
          links. Your tasks are stored in an ordinary Markdown file on your
          computer, so you can read and edit them either through this app or in
          any text editor. Everything you change is saved automatically &mdash;
          there is no "save" button to remember.
        </p>

        <h3>The tabs</h3>
        <p>The app is organised into five tabs, shown across the top of the page:</p>
        <ul>
          <li><strong>Tasks</strong> &ndash; your to-do lists, and the main place you work.</li>
          <li><strong>Markdown</strong> &ndash; the raw text behind your tasks, if you prefer to edit it directly.</li>
          <li><strong>About</strong> &ndash; this page.</li>
          <li><strong>Backups</strong> &ndash; automatic snapshots of your tasks that you can restore.</li>
          <li><strong>Links</strong> &ndash; a categorised list of links you want to keep handy.</li>
        </ul>
        <p>
          The tab you are on is remembered in the page address, so you can
          bookmark a particular tab or reload the page without losing your place.
        </p>

        <h3>Tasks tab</h3>
        <p>Your tasks are split across three lists:</p>
        <ul>
          <li><strong>Priority</strong> &ndash; the things you want to focus on.</li>
          <li><strong>Other</strong> &ndash; everything else that still needs doing.</li>
          <li><strong>Done</strong> &ndash; completed tasks, each stamped with the date it was finished.</li>
        </ul>

        <p><strong>Adding a task.</strong> Type into the box at the top of the tab and
          click <em>Add</em> (or press the keyboard shortcut shown in the box). New
          tasks are added to the Priority list. A task can span several lines.</p>

        <p><strong>Editing a task.</strong> There are two ways to edit an existing task:</p>
        <ul>
          <li>Hold <kbd>command</kbd> (or <kbd>Ctrl</kbd>) and click the task, or</li>
          <li>Double-click the task and choose <em>Edit</em> from the menu.</li>
        </ul>
        <p>Either way the task is loaded back into the box at the top, where you
          can change it and click <em>Save</em>, or click <em>Cancel</em> to leave it unchanged.</p>
        <p><strong>Formatting text.</strong> Select text and press <kbd>Cmd</kbd>+<kbd>B</kbd>
          for bold or <kbd>Cmd</kbd>+<kbd>I</kbd> for italics on macOS.
          On Windows/Linux, use <kbd>Ctrl</kbd> instead of <kbd>Cmd</kbd>.
          These shortcuts insert Markdown formatting in task text, the Markdown editor,
          and link descriptions.</p>
        <p>To turn selected text into a Markdown link, paste a URL over it.
          For example, pasting <code>https://www.bbc.co.uk/news</code> over
          <code>this website</code> produces
          <code>[this website](https://www.bbc.co.uk/news)</code>.
          Pasting other text replaces the selection normally.</p>
        <p><strong>Undo and redo.</strong> Use <kbd>Cmd</kbd>+<kbd>Z</kbd> to undo and
          <kbd>Shift</kbd>+<kbd>Cmd</kbd>+<kbd>Z</kbd> to redo on macOS. On Windows/Linux,
          use <kbd>Ctrl</kbd>+<kbd>Z</kbd> to undo and <kbd>Ctrl</kbd>+<kbd>Y</kbd> or
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> to redo. Each field keeps its own
          history for the current entry, including formatting and pasted links.
          Saving, canceling, or opening another entry resets its history.
          Autosaves in the Markdown editor do not reset history.</p>
        <p>Tasks also support nested bullet and numbered lists, paragraphs, headings,
          block quotes, code blocks, and tables. Use <code>- </code> for a bullet
          and indent nested bullets with spaces. Indentation and blank lines
          are preserved when you save and reopen a task.</p>

        <p><strong>The task menu.</strong> Double-click any task to open a menu with these options:</p>
        <ul>
          <li><strong>Edit</strong> &ndash; load the task into the box for editing.</li>
          <li><strong>Move to "Other"</strong> / <strong>Move to "Priority"</strong> &ndash; move the task between those two lists.</li>
          <li><strong>Delete</strong> &ndash; remove the task.</li>
        </ul>

        <p><strong>Marking a task done.</strong> Tick the checkbox next to a task to move
          it to the Done list (today's date is added automatically). Un-ticking a
          task in the Done list moves it back and removes the date.</p>

        <p><strong>Reordering and moving.</strong> Drag a task up or down to reorder it, or
          drag it onto another list to move it there.</p>

        <p><strong>Links inside tasks.</strong> You can include Markdown links in a task
          &mdash; for example <code>[GitHub](https://github.com)</code> &mdash; and they
          appear as clickable links in the list.</p>

        <h3>Markdown tab</h3>
        <p>
          This tab shows the raw Markdown text behind your tasks. If you are
          comfortable editing text directly you can make changes here, and they
          are saved automatically and reflected on the Tasks tab. The three lists
          are simply the <code># Priority</code>, <code># Other</code> and
          <code># Done</code> headings in this file.
        </p>

        <h3>Backups tab</h3>
        <p>
          Every time your tasks change, the app automatically saves a backup so
          you can go back to an earlier version. The Backups tab lists the ten
          most recent backups, newest first, with the date and time each was taken.
        </p>
        <p>
          Click a backup to preview it. The preview opens on the Tasks tab as a
          read-only view, with a banner explaining that you are looking at a
          backup. From there you can:
        </p>
        <ul>
          <li><strong>Use this backup</strong> &ndash; replace your current tasks with the backup.
            Note that this loses any changes you have made since the backup was taken.</li>
          <li><strong>Cancel</strong> &ndash; leave your current tasks untouched and return to the Backups tab.</li>
        </ul>
        <p>
          Only the ten most recent backups are kept; when a new one is made the
          oldest is removed automatically.
        </p>

        <h3>Links tab</h3>
        <p>
          The Links tab is a place to store useful links, grouped into categories
          (for example "GitHub"). For each link you record a category, a URL and a
          short description. You can add, edit and delete links, expand or collapse
          the categories, and click a link to open it.
        </p>

        <h3>Where your files are kept</h3>
        <p>Your tasks (shown on the Tasks and Markdown tabs) are stored in:</p>
        <p><code>/Users/alistair/work-stuff/tech-writing/todo.md</code></p>
        <p>To edit this file directly <a :href="`vscode://file/Users/alistair/work-stuff/tech-writing/todo.md`">click here</a> or press <kbd>control</kbd>+<kbd>command</kbd>+<kbd>-</kbd></p>
        <p>Backups are saved in the same folder, named
          <code>todo-backup-<em>DATETIME</em>.md</code> (for example
          <code>todo-backup-20260728T143052.md</code>).</p>
        <p>Your links (shown on the Links tab) are stored in the same folder as a JSON file:</p>
        <p><code>/Users/alistair/work-stuff/tech-writing/links.json</code></p>
        <p>To edit it directly <a :href="`vscode://file/Users/alistair/work-stuff/tech-writing/links.json`">click here</a>.</p>
        <p>
          Because the app watches these files, any edits you make outside the app
          (in a text editor, for instance) appear here automatically when the tab
          is clean. Independent changes merge automatically. If the same content
          changed in two places, the conflict dialog calls this tab's edit
          <strong>Current change</strong> and the newest saved edit
          <strong>Other change</strong>; resolve each step, then apply the result.
          Restoring a backup over newer content always asks for explicit
          confirmation instead of combining the two versions.
        </p>

        <h3>Project information</h3>
        <p>Code repository: <a href="https://github.com/hubwriter/todo-page" target="_blank" rel="noopener noreferrer">https://github.com/hubwriter/todo-page</a></p>
        <p>Created using Copilot Agent mode in VS Code on 16 October 2025.</p>
      </div>
    </div>

    <!-- Backups Tab -->
    <div v-show="activeTab === 'backups'" id="backups-panel" role="tabpanel">
      <BackupsTab :active="activeTab === 'backups'" @view-backup="handleViewBackup" />
    </div>

    <!-- Links Tab -->
    <div v-show="activeTab === 'links'" id="links-panel" role="tabpanel">
      <LinksTab :active="activeTab === 'links'" />
    </div>

    <ConflictResolutionDialog
      v-if="activeConflict"
      :key="activeConflict.revision"
      :workflow="activeConflict"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { marked } from 'marked';
import TaskList from './components/TaskList.vue';
import ContextMenu from './components/ContextMenu.vue';
import LinksTab from './components/LinksTab.vue';
import BackupsTab from './components/BackupsTab.vue';
import ConflictResolutionDialog from './components/ConflictResolutionDialog.vue';
import { useTasks } from './composables/useTasks.js';
import { useContextMenu } from './composables/useContextMenu.js';
import { useTaskEditor } from './composables/useTaskEditor.js';
import { setupFileWatcher } from './api/todoApi.js';
import { loadBackupContent } from './api/backupsApi.js';
import { generateMarkdownFromTasks, removeDateFromTask, parseMarkdownToTasks } from './utils/markdownUtils.js';
import { parseBackupTimestamp } from './utils/backupUtils.js';
import { calculateDropPosition, getTaskList } from './utils/taskUtils.js';
import { tabToHash, hashToTab, getTabFromHash } from './utils/tabRouting.js';
import { handleFormattingShortcut } from './utils/formattingShortcuts.js';
import { handleMarkdownPaste } from './utils/markdownPaste.js';
import { vEditHistory } from './utils/editHistory.js';
import { AUTO_SAVE_DELAY_MS } from './constants.js';
import { useConflictDialogQueue } from './composables/useConflictDialogQueue.js';

// Configure marked for inline rendering
marked.setOptions({
  breaks: true,
  gfm: true
});

// State
const activeTab = ref(getTabFromHash(window.location.hash));
const backupPreview = ref(null); // { filename, timestamp, content, priority, other, done } when previewing a backup
const backupRecoveryDraft = ref(null);
const draggedItem = ref(null);
const taskInputRef = ref(null); // Reference to the task input textarea
const hasInitialFocusBeenApplied = ref(false); // Track if initial auto-focus has been applied
let eventSource = null;
let autoSaveTimer = null;
const BACKUP_RESTORE_DRAFT_KEY = 'todo-page-backup-restore-draft:todo';

// Composables
const {
  priorityTasks,
  otherTasks,
  doneTasks,
  markdownContent,
  error,
  version,
  dirty,
  resolving,
  externalChange,
  unresolved,
  contention,
  inFlight,
  pendingOperations,
  loadTasks,
  saveTasks,
  saveContent,
  markContentDirty,
  restoreLocalCandidate,
  completeTask,
  uncompleteTask,
  deleteTask,
  moveTaskBetweenSections,
  replaceFromBackup,
  snapshotTasks,
  noteExternalVersion,
  getTaskLists
} = useTasks();
const { activeConflict } = useConflictDialogQueue();

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
  restoreDraft: restoreTaskEditorDraft,
  getEditState,
  scrollToTask
} = useTaskEditor();

// Computed
const editState = computed(() => getEditState());
const hasLocalTodoWork = computed(() => (
  Boolean(newTask.value.trim())
  || editState.value.isEditing
  || dirty.value
  || resolving.value
  || unresolved.value
  || inFlight.value
  || pendingOperations.value > 0
));

const backupPreviewLabel = computed(() => {
  if (!backupPreview.value) return '';
  const date = parseBackupTimestamp(backupPreview.value.filename);
  return date ? date.toLocaleString() : backupPreview.value.filename;
});

const taskInputPlaceholder = computed(() => {
  return editState.value.isEditing
    ? 'Editing task... (Cmd+Enter or Ctrl+S to save to original position)'
    : 'Add new task to Priority... (Cmd+Enter or Ctrl+S to submit)';
});

// Minimum (and default) number of visible lines for the task input box.
const TASK_INPUT_MIN_LINES = 3;

/**
 * Auto-size the task input textarea.
 *
 * The box has a minimum/default depth of 3 lines and grows one line at a time
 * so that there is always an empty line below the last line of text, up to a
 * maximum of half the visible browser page height. Beyond that cap the box
 * stops growing and becomes scrollable.
 */
function adjustTaskInputHeight() {
  const el = taskInputRef.value;
  if (!el) return;

  const style = window.getComputedStyle(el);
  const lineHeight = parseFloat(style.lineHeight);
  if (!lineHeight) return; // Guard against non-numeric line-height ("normal")

  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;
  const verticalExtra = paddingTop + paddingBottom + borderTop + borderBottom;

  // Measure the natural content height (scrollHeight includes vertical padding).
  el.style.height = 'auto';
  const contentHeight = el.scrollHeight - paddingTop - paddingBottom;
  const contentLines = Math.max(1, Math.round(contentHeight / lineHeight));

  // Always keep an empty line below the last line of text, respecting the minimum.
  const desiredLines = Math.max(TASK_INPUT_MIN_LINES, contentLines + 1);

  // Cap at half the visible page height.
  const maxHeight = window.innerHeight / 2;
  const maxLines = Math.max(1, Math.floor((maxHeight - verticalExtra) / lineHeight));

  const finalLines = Math.min(desiredLines, maxLines);
  el.style.height = `${finalLines * lineHeight + verticalExtra}px`;
  el.style.overflowY = desiredLines > maxLines ? 'auto' : 'hidden';
}

// Task Management
async function handleAddOrSave() {
  if (!newTask.value.trim()) return;

  const taskText = newTask.value.trim();

  if (editState.value.isEditing) {
    // Editing mode: restore to original position
    const { originalList, originalIndex } = editState.value;

    // Replace the source task only when Save is pressed.
    const lists = getTaskLists();
    const targetList = getTaskList(originalList, lists);
    const snapshot = snapshotTasks();
    targetList.splice(originalIndex, 1, taskText);
    try {
      await saveTasks(snapshot);
      scrollToTask(originalList, originalIndex);
      cancelEdit();
    } catch {
      // saveTasks restored the optimistic insertion; keep the edit draft.
    }
  } else {
    // Normal add: add to top of Priority
    const snapshot = snapshotTasks();
    priorityTasks.value.unshift(taskText);
    try {
      await saveTasks(snapshot);
      newTask.value = '';
    } catch {
      // Keep the typed task so an ordinary failure never loses it.
    }
  }
}

async function handleCancel() {
  if (editState.value.isEditing) {
    const { originalList, originalIndex } = editState.value;
    scrollToTask(originalList, originalIndex);
  }
  cancelEdit();
}

function handleKeyDown(event) {
  handleFormattingShortcut(event);
  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    handleAddOrSave();
  }
  // Ctrl+S to submit (same as Cmd+Enter)
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault();
    handleAddOrSave();
  }
  // Esc cancels, exactly like clicking the Cancel button
  if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
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
  closeContextMenu();
  await editTaskInTextBox(listType, taskIndex, taskText);
}

async function handleEditTask(listType, index, taskText) {
  await editTaskInTextBox(listType, index, taskText);
}

async function editTaskInTextBox(listType, taskIndex, taskText) {
  startEdit(listType, taskIndex, taskText);
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

// Backup preview handlers
function preserveBackupRestoreDraft() {
  sessionStorage.setItem(BACKUP_RESTORE_DRAFT_KEY, JSON.stringify({
    content: markdownContent.value,
    taskInput: newTask.value,
    editState: editState.value,
    preferredTab: newTask.value.trim() || editState.value.isEditing ? 'tasks' : 'editor',
    dirty: dirty.value,
    resolving: resolving.value,
    unresolved: unresolved.value,
    capturedAt: new Date().toISOString()
  }));
}

function readBackupRestoreDraft() {
  const stored = sessionStorage.getItem(BACKUP_RESTORE_DRAFT_KEY);
  if (!stored) return null;
  try {
    const draft = JSON.parse(stored);
    if (!draft || typeof draft.content !== 'string') return null;
    const hasEditorDraft = typeof draft.taskInput === 'string' && draft.taskInput.length > 0;
    if (draft.content === markdownContent.value && !hasEditorDraft) return null;
    return draft;
  } catch {
    return null;
  }
}

function refreshBackupRecoveryDraft() {
  backupRecoveryDraft.value = readBackupRestoreDraft();
}

function restorableEditState(draft) {
  const state = draft.editState;
  if (!state?.isEditing || !Number.isInteger(state.originalIndex)) return null;
  const targetList = getTaskList(state.originalList, getTaskLists());
  if (!targetList || targetList[state.originalIndex] !== state.originalText) return null;
  return state;
}

function handleRestoreBackupDraft() {
  const draft = readBackupRestoreDraft();
  if (!draft) {
    backupRecoveryDraft.value = null;
    return;
  }
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  restoreLocalCandidate(draft.content);
  restoreTaskEditorDraft(draft.taskInput, restorableEditState(draft));
  activeTab.value = draft.preferredTab === 'tasks' || draft.taskInput
    ? 'tasks'
    : 'editor';
  sessionStorage.removeItem(BACKUP_RESTORE_DRAFT_KEY);
  backupRecoveryDraft.value = null;
}

function handleDiscardBackupDraft() {
  sessionStorage.removeItem(BACKUP_RESTORE_DRAFT_KEY);
  backupRecoveryDraft.value = null;
}

async function handleViewBackup(filename) {
  try {
    error.value = '';
    if (hasLocalTodoWork.value) {
      preserveBackupRestoreDraft();
      const approved = window.confirm(
        'You have an unsaved task or Markdown draft. Preview this backup without changing that draft? Cancel returns to it exactly as it is.'
      );
      if (!approved) return;
    }
    const content = await loadBackupContent(filename);
    const parsed = parseMarkdownToTasks(content);

    backupPreview.value = {
      filename,
      content,
      previewVersion: version.value,
      priority: parsed.priority,
      other: parsed.other,
      done: parsed.done
    };
    activeTab.value = 'tasks';
  } catch (err) {
    error.value = `Error loading backup: ${err.message}`;
    console.error('Error loading backup:', err);
  }
}

async function handleUseBackup() {
  if (!backupPreview.value) return;

  try {
    error.value = '';
    if (hasLocalTodoWork.value) {
      preserveBackupRestoreDraft();
      const approved = window.confirm(
        'You have unsaved task or Markdown work. Restore this backup and keep that draft in this browser for recovery? Cancel leaves the draft and preview unchanged.'
      );
      if (!approved) return;
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
    }
    const result = await replaceFromBackup(
      backupPreview.value.content,
      backupPreview.value.previewVersion,
      () => Promise.resolve(window.confirm(
        'The live tasks changed since this backup was previewed. Replace the newest content with this backup? The newest content will be backed up first.'
      ))
    );
    if (result.replaced) {
      backupPreview.value = null;
      cancelEdit();
      refreshBackupRecoveryDraft();
    }
  } catch (err) {
    error.value = `Error restoring backup: ${err.message}`;
    console.error('Error restoring backup:', err);
  }
}

function handleCancelBackup() {
  backupPreview.value = null;
  activeTab.value = 'backups';
}

// Markdown Editor
async function saveMarkdown() {
  try {
    error.value = '';
    await saveContent(markdownContent.value);
  } catch (err) {
    error.value = `Error saving markdown: ${err.message}`;
    console.error('Error saving markdown:', err);
  }
}

function handleMarkdownInput() {
  markContentDirty(markdownContent.value);
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(saveMarkdown, AUTO_SAVE_DELAY_MS);
}

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

// Keep the task input sized to its content whenever the text changes
// (typing, starting an edit, or resetting after save/cancel).
watch(newTask, () => {
  nextTick(adjustTaskInputHeight);
});

// Recompute the task input size when returning to the Tasks tab, since the
// textarea can't be measured reliably while its panel is hidden.
watch(activeTab, (tab) => {
  if (tab === 'tasks') {
    nextTick(adjustTaskInputHeight);
  } else if (tab === 'editor') {
    if (!dirty.value && !resolving.value && !editState.value.isEditing) {
      loadTasks();
    } else if (externalChange.value && !resolving.value) {
      saveMarkdown();
    }
  }
});

// Keep the URL hash in sync when the active tab changes
watch(activeTab, (tab) => {
  const hash = `#${tabToHash(tab)}`;
  if (window.location.hash !== hash) {
    window.location.hash = hash;
  }
});

// Switch tabs when the URL hash changes (deep links, back/forward navigation)
function handleHashChange() {
  const tab = hashToTab(window.location.hash);
  if (tab && tab !== activeTab.value) {
    activeTab.value = tab;
  }
}

function handleBeforeUnload(event) {
  if (!newTask.value.trim() && !dirty.value && !resolving.value) return;
  event.preventDefault();
  event.returnValue = '';
}

// Lifecycle
onMounted(async () => {
  await loadTasks();
  refreshBackupRecoveryDraft();

  eventSource = setupFileWatcher((notification) => {
    if (notification.resync) {
      loadTasks({ preserveLocal: dirty.value || resolving.value || editState.value.isEditing });
      window.dispatchEvent(new CustomEvent('resource-version-change', { detail: notification }));
      return;
    }
    if (notification.resource === 'todo' && notification.version !== version.value) {
      if (dirty.value || resolving.value || editState.value.isEditing) {
        noteExternalVersion(notification.version);
      } else {
        loadTasks();
      }
    }
    window.dispatchEvent(new CustomEvent('resource-version-change', { detail: notification }));
  });

  window.addEventListener('keydown', handleEscKey);
  window.addEventListener('hashchange', handleHashChange);
  window.addEventListener('resize', adjustTaskInputHeight);
  window.addEventListener('beforeunload', handleBeforeUnload);

  // Size the task input to its default (3 lines) once the DOM is ready.
  nextTick(adjustTaskInputHeight);

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
  window.removeEventListener('hashchange', handleHashChange);
  window.removeEventListener('resize', adjustTaskInputHeight);
  window.removeEventListener('beforeunload', handleBeforeUnload);
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
  resize: none;
  line-height: 1.5;
  overflow-y: hidden;
  font-family: inherit;
}

.error {
  color: #ff4444;
  padding: 0.4rem;
  margin-bottom: 0.8rem;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
}

.backup-banner {
  margin-bottom: 1.5rem;
  padding: 1rem;
  border: 1px solid #ffd27a;
  border-radius: 6px;
  background-color: #fff8e6;
  color: #5c4400;
}

.conflict-banner {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e0a800;
  border-radius: 6px;
  background: #fff8db;
  color: #5c4400;
}

.recovery-banner {
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #2563eb;
  border-radius: 6px;
  background: #eff6ff;
  color: #1e3a8a;
}

.recovery-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.recovery-actions .btn-secondary {
  padding: 0.5rem 1rem;
}

.backup-banner p {
  margin: 0 0 0.5rem;
}

.backup-banner .button-group {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.8rem;
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
