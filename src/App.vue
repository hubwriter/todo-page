<template>
  <div class="todo-app">
    <h1>To do</h1>

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

    <div v-show="activeTab === 'tasks'" id="tasks-panel" role="tabpanel">
      <div class="add-task">
        <textarea
          v-model="newTask"
          placeholder="Add new task to Priority... (Cmd+Enter to submit)"
          aria-label="New task"
          rows="3"
          @keydown="handleKeyDown"
        ></textarea>
        <button @click="addTask" aria-label="Add task" class="btn-primary">Add</button>
      </div>

      <div class="error" v-if="error" role="alert">{{ error }}</div>

      <div class="lists-container">
        <section class="task-list" aria-labelledby="priority-heading">
          <h2 id="priority-heading">Priority</h2>
          <ul
            @drop="onDrop($event, 'Priority')"
            @dragover.prevent
            @dragenter.prevent
          >
            <li
              v-for="(task, index) in priorityTasks"
              :key="`priority-${task}-${index}`"
              :draggable="true"
              @dragstart="onDragStart($event, 'Priority', index)"
              class="task-item"
            >
              <input
                type="checkbox"
                :id="`priority-${index}`"
                :checked="false"
                @change="completeTask('Priority', index)"
                :aria-label="`Mark ${task} as complete`"
              />
              <div class="task-text">
                <span class="task-first-line" v-html="renderMarkdown(task.split('\n')[0])"></span>
                <span v-if="task.includes('\n')" class="task-continuation">
                  <span v-for="(line, lineIndex) in task.split('\n').slice(1)" :key="lineIndex" class="task-indent" v-html="renderMarkdown(line)"></span>
                </span>
              </div>
            </li>
          </ul>
        </section>

        <section class="task-list" aria-labelledby="other-heading">
          <h2 id="other-heading">Other</h2>
          <ul
            @drop="onDrop($event, 'Other')"
            @dragover.prevent
            @dragenter.prevent
          >
            <li
              v-for="(task, index) in otherTasks"
              :key="`other-${task}-${index}`"
              :draggable="true"
              @dragstart="onDragStart($event, 'Other', index)"
              class="task-item"
            >
              <input
                type="checkbox"
                :id="`other-${index}`"
                :checked="false"
                @change="handleOtherTaskCheck('Other', index)"
                :aria-label="`Process ${task}`"
              />
              <div class="task-text">
                <span class="task-first-line" v-html="renderMarkdown(task.split('\n')[0])"></span>
                <span v-if="task.includes('\n')" class="task-continuation">
                  <span v-for="(line, lineIndex) in task.split('\n').slice(1)" :key="lineIndex" class="task-indent" v-html="renderMarkdown(line)"></span>
                </span>
              </div>
            </li>
          </ul>
        </section>

        <section class="task-list" aria-labelledby="done-heading">
          <h2 id="done-heading">Done</h2>
          <ul
            @drop="onDrop($event, 'Done')"
            @dragover.prevent
            @dragenter.prevent
          >
            <li
              v-for="(task, index) in doneTasks"
              :key="`done-${task}-${index}`"
              :draggable="true"
              @dragstart="onDragStart($event, 'Done', index)"
              class="task-item done"
            >
              <input
                type="checkbox"
                :id="`done-${index}`"
                :checked="true"
                @change="uncompleteTask('Done', index)"
                :aria-label="`Uncomplete: ${task}`"
              />
              <div class="task-text">
                <span class="task-first-line" v-html="renderMarkdown(task.split('\n')[0])"></span>
                <span v-if="task.includes('\n')" class="task-continuation">
                  <span v-for="(line, lineIndex) in task.split('\n').slice(1)" :key="lineIndex" class="task-indent" v-html="renderMarkdown(line)"></span>
                </span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <div v-show="activeTab === 'editor'" id="editor-panel" role="tabpanel">
      <div class="markdown-editor">
        <h2>Markdown Editor</h2>
        <textarea
          v-model="markdownContent"
          aria-label="Markdown editor"
        ></textarea>
      </div>
    </div>

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
          <li>Backend server runs on port 3001 (Express/Node.js)</li>
          <li>Frontend dev server runs on port 5173 (Vite)</li>
          <li>Auto-starts on login via macOS LaunchAgents (<code>com.user.todo-backend</code>, <code>com.user.todo-frontend</code>)</li>
          <li>Configuration via <code>config.json</code> in project root</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { marked } from 'marked';

// Configure marked for inline rendering with HTML support
marked.setOptions({
  breaks: true,
  gfm: true,
  sanitize: false // Allow HTML tags like <img>
});

const API_BASE = '/api';

const activeTab = ref('tasks');
const newTask = ref('');
const markdownContent = ref('');
const priorityTasks = ref([]);
const otherTasks = ref([]);
const doneTasks = ref([]);
const error = ref('');
const draggedItem = ref(null);
let eventSource = null;
let autoSaveTimer = null;

// Transform local file paths to API URLs
function transformImagePaths(text) {
  if (!text) return text;

  // Replace file:// URLs in img tags
  text = text.replace(
    /<img\s+([^>]*?)src=["']file:\/\/([^"']+)["']([^>]*?)>/gi,
    (match, before, path, after) => {
      const encodedPath = encodeURIComponent(path);
      return `<img ${before}src="/api/image?path=${encodedPath}"${after}>`;
    }
  );

  // Replace absolute paths in img tags (starting with /)
  text = text.replace(
    /<img\s+([^>]*?)src=["'](\/.+?)["']([^>]*?)>/gi,
    (match, before, path, after) => {
      const encodedPath = encodeURIComponent(path);
      return `<img ${before}src="/api/image?path=${encodedPath}"${after}>`;
    }
  );

  // Replace markdown image syntax with local paths
  text = text.replace(
    /!\[([^\]]*)\]\((\/.+?)\)/g,
    (match, alt, path) => {
      const encodedPath = encodeURIComponent(path);
      return `![${alt}](/api/image?path=${encodedPath})`;
    }
  );

  return text;
}

// Render markdown with HTML support
function renderMarkdown(text) {
  if (!text) return '';
  // Transform local image paths to API URLs first
  text = transformImagePaths(text);
  // Use marked.parseInline for inline rendering while allowing HTML
  return marked.parseInline(text, { async: false });
}

// Parse markdown content into tasks
function parseMarkdown(content) {
  const lines = content.split('\n');
  let currentSection = null;
  const priority = [];
  const other = [];
  const done = [];
  let currentTask = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '# Priority') {
      currentSection = 'priority';
      currentTask = null;
    } else if (trimmed === '# Other') {
      currentSection = 'other';
      currentTask = null;
    } else if (trimmed === '# Done') {
      currentSection = 'done';
      currentTask = null;
    } else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
      // Start of a new task
      const taskText = trimmed.substring(5).trim();
      if (taskText) {
        currentTask = taskText;
        if (currentSection === 'priority') {
          priority.push(currentTask);
        } else if (currentSection === 'other') {
          other.push(currentTask);
        } else if (currentSection === 'done') {
          done.push(currentTask);
        }
      }
    } else if (trimmed && currentTask !== null && currentSection) {
      // Continuation line (indented paragraph)
      const updatedTask = currentTask + '\n' + trimmed;
      if (currentSection === 'priority') {
        priority[priority.length - 1] = updatedTask;
      } else if (currentSection === 'other') {
        other[other.length - 1] = updatedTask;
      } else if (currentSection === 'done') {
        done[done.length - 1] = updatedTask;
      }
      currentTask = updatedTask;
    }
  }

  return { priority, other, done };
}

// Generate markdown from tasks
function generateMarkdown() {
  let content = '# Priority\n\n';
  for (const task of priorityTasks.value) {
    const lines = task.split('\n');
    content += `- [ ] ${lines[0]}\n`;
    // Add continuation lines with indentation
    for (let i = 1; i < lines.length; i++) {
      content += `  ${lines[i]}\n`;
    }
  }

  content += '\n# Other\n\n';
  for (const task of otherTasks.value) {
    const lines = task.split('\n');
    content += `- [ ] ${lines[0]}\n`;
    for (let i = 1; i < lines.length; i++) {
      content += `  ${lines[i]}\n`;
    }
  }

  content += '\n# Done\n\n';
  for (const task of doneTasks.value) {
    const lines = task.split('\n');
    content += `- [x] ${lines[0]}\n`;
    for (let i = 1; i < lines.length; i++) {
      content += `  ${lines[i]}\n`;
    }
  }

  return content;
}

// Load tasks from the server
async function loadTasks() {
  try {
    error.value = '';
    const response = await fetch(`${API_BASE}/todo`);
    if (!response.ok) {
      throw new Error('Failed to load tasks');
    }
    const data = await response.json();
    markdownContent.value = data.content;

    const parsed = parseMarkdown(data.content);
    priorityTasks.value = parsed.priority;
    otherTasks.value = parsed.other;
    doneTasks.value = parsed.done;
  } catch (err) {
    error.value = `Error loading tasks: ${err.message}`;
    console.error('Error loading tasks:', err);
  }
}

// Save tasks to the server
async function saveTasks() {
  try {
    error.value = '';
    const content = generateMarkdown();
    markdownContent.value = content;

    const response = await fetch(`${API_BASE}/todo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error('Failed to save tasks');
    }
  } catch (err) {
    error.value = `Error saving tasks: ${err.message}`;
    console.error('Error saving tasks:', err);
  }
}

// Add a new task to Priority
async function addTask() {
  if (newTask.value.trim()) {
    priorityTasks.value.unshift(newTask.value.trim());
    newTask.value = '';
    await saveTasks();
  }
}

// Handle keyboard shortcuts for adding tasks
function handleKeyDown(event) {
  // Cmd+Enter (Mac) or Ctrl+Enter (Windows/Linux) to submit
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault();
    addTask();
  }
}

// Complete a task (move to Done with date)
async function completeTask(section, index) {
  let task;
  if (section === 'Priority') {
    task = priorityTasks.value.splice(index, 1)[0];
  } else if (section === 'Other') {
    task = otherTasks.value.splice(index, 1)[0];
  }

  const today = new Date().toISOString().split('T')[0];
  doneTasks.value.unshift(`${today} - ${task}`);
  await saveTasks();
}

// Handle checkbox for Other tasks (move to Done with date)
async function handleOtherTaskCheck(section, index) {
  const task = otherTasks.value.splice(index, 1)[0];
  const today = new Date().toISOString().split('T')[0];
  doneTasks.value.unshift(`${today} - ${task}`);
  await saveTasks();
}

// Uncomplete a task (move from Done back to Priority)
async function uncompleteTask(section, index) {
  const task = doneTasks.value.splice(index, 1)[0];
  // Remove date prefix (format: "YYYY-MM-DD - task text")
  const cleanTask = task.replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, '');
  priorityTasks.value.unshift(cleanTask);
  await saveTasks();
}

// Drag and drop handlers
function onDragStart(event, section, index) {
  draggedItem.value = { section, index };
  event.dataTransfer.effectAllowed = 'move';
}

function onDrop(event, targetSection) {
  event.preventDefault();

  if (!draggedItem.value) return;

  const { section: sourceSection, index: sourceIndex } = draggedItem.value;

  // Don't allow dropping into Done section
  if (targetSection === 'Done') {
    draggedItem.value = null;
    return;
  }

  // Get the task being dragged
  let task;
  if (sourceSection === 'Priority') {
    task = priorityTasks.value[sourceIndex];
  } else if (sourceSection === 'Other') {
    task = otherTasks.value[sourceIndex];
  } else if (sourceSection === 'Done') {
    task = doneTasks.value[sourceIndex];
    // Remove date prefix from Done tasks
    task = task.replace(/^\d{4}-\d{2}-\d{2}\s*-\s*/, '');
  }

  // Calculate drop position
  const listElement = event.currentTarget;
  const items = Array.from(listElement.children);
  let targetIndex = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rect = item.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;

    if (event.clientY < middle) {
      targetIndex = i;
      break;
    }
  }

  // Remove from source
  if (sourceSection === 'Priority') {
    priorityTasks.value.splice(sourceIndex, 1);
  } else if (sourceSection === 'Other') {
    otherTasks.value.splice(sourceIndex, 1);
  } else if (sourceSection === 'Done') {
    doneTasks.value.splice(sourceIndex, 1);
  }

  // Adjust target index if moving within same section
  if (sourceSection === targetSection && sourceIndex < targetIndex) {
    targetIndex--;
  }

  // Insert at target
  if (targetSection === 'Priority') {
    priorityTasks.value.splice(targetIndex, 0, task);
  } else if (targetSection === 'Other') {
    otherTasks.value.splice(targetIndex, 0, task);
  }

  draggedItem.value = null;
  saveTasks();
}

// Save markdown content from editor
async function saveMarkdown() {
  try {
    error.value = '';
    const response = await fetch(`${API_BASE}/todo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: markdownContent.value }),
    });

    if (!response.ok) {
      throw new Error('Failed to save markdown');
    }

    // Reload tasks after saving
    await loadTasks();
  } catch (err) {
    error.value = `Error saving markdown: ${err.message}`;
    console.error('Error saving markdown:', err);
  }
}

// Watch for external file changes
function setupFileWatcher() {
  eventSource = new EventSource(`${API_BASE}/todo/watch`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'change') {
      console.log('File changed externally, reloading...');
      loadTasks();
    }
  };

  eventSource.onerror = (err) => {
    console.error('EventSource error:', err);
    // Attempt to reconnect
    eventSource.close();
    setTimeout(setupFileWatcher, 5000);
  };
}

// Auto-save markdown content with debouncing
watch(markdownContent, (newValue, oldValue) => {
  // Only auto-save if content actually changed and we're in the editor tab
  if (newValue !== oldValue && activeTab.value === 'editor') {
    // Clear existing timer
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
    }
    // Set new timer to save after 1 second of inactivity
    autoSaveTimer = setTimeout(() => {
      saveMarkdown();
    }, 1000);
  }
});

onMounted(() => {
  loadTasks();
  setupFileWatcher();
});

onUnmounted(() => {
  if (eventSource) {
    eventSource.close();
  }
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

.task-list {
  width: 100%;
}

.task-list h2 {
  margin-top: 0;
  margin-bottom: 0.6rem;
}

.task-list ul {
  list-style: none;
  padding: 0;
  min-height: 80px;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 0.4rem;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.4rem;
  margin-bottom: 0.4rem;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: move;
}

.task-item input[type="checkbox"] {
  cursor: pointer;
  margin-top: 0.25rem;
  flex-shrink: 0;
}

.task-text {
  flex: 1;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.task-text img {
  max-width: 100%;
  height: auto;
  display: inline-block;
  margin: 0.5rem 0;
  border-radius: 4px;
  vertical-align: middle;
}

.task-first-line {
  display: block;
}

.task-continuation {
  display: block;
}

.task-indent {
  display: block;
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

.markdown-editor button {
  margin-top: 0.5rem;
  align-self: flex-start;
}

.btn-primary {
  background-color: #22c55e !important;
  color: white !important;
  border: 1px solid #16a34a !important;
}

.btn-primary:hover {
  background-color: #16a34a !important;
  border-color: #15803d !important;
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
  color: #646cff;
  text-decoration: none;
}

.notes-content a:hover {
  text-decoration: underline;
}
</style>
