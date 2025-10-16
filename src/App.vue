<template>
  <div class="todo-app">
    <h1>To-Do List</h1>
    
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
        Markdown Editor
      </button>
    </div>

    <div v-show="activeTab === 'tasks'" id="tasks-panel" role="tabpanel">
      <div class="add-task">
        <input
          v-model="newTask"
          type="text"
          placeholder="Add new task to Priority..."
          aria-label="New task"
          @keyup.enter="addTask"
        />
        <button @click="addTask" aria-label="Add task">Add</button>
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
              :key="`priority-${index}`"
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
              <label :for="`priority-${index}`">{{ task }}</label>
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
              :key="`other-${index}`"
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
              <label :for="`other-${index}`">{{ task }}</label>
            </li>
          </ul>
        </section>

        <section class="task-list" aria-labelledby="done-heading">
          <h2 id="done-heading">Done</h2>
          <ul>
            <li
              v-for="(task, index) in doneTasks"
              :key="`done-${index}`"
              class="task-item done"
            >
              <input
                type="checkbox"
                :id="`done-${index}`"
                :checked="true"
                disabled
                :aria-label="`Completed: ${task}`"
              />
              <label :for="`done-${index}`">{{ task }}</label>
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
          @blur="saveMarkdown"
          rows="20"
          aria-label="Markdown editor"
        ></textarea>
        <button @click="saveMarkdown">Save Markdown</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';

const API_BASE = 'http://localhost:3001/api';

const activeTab = ref('tasks');
const newTask = ref('');
const markdownContent = ref('');
const priorityTasks = ref([]);
const otherTasks = ref([]);
const doneTasks = ref([]);
const error = ref('');
const draggedItem = ref(null);
let eventSource = null;

// Parse markdown content into tasks
function parseMarkdown(content) {
  const lines = content.split('\n');
  let currentSection = null;
  const priority = [];
  const other = [];
  const done = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed === '# Priority') {
      currentSection = 'priority';
    } else if (trimmed === '# Other') {
      currentSection = 'other';
    } else if (trimmed === '# Done') {
      currentSection = 'done';
    } else if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]')) {
      const taskText = trimmed.substring(5).trim();
      if (taskText) {
        if (currentSection === 'priority') {
          priority.push(taskText);
        } else if (currentSection === 'other') {
          other.push(taskText);
        } else if (currentSection === 'done') {
          done.push(taskText);
        }
      }
    }
  }

  return { priority, other, done };
}

// Generate markdown from tasks
function generateMarkdown() {
  let content = '# Priority\n\n';
  for (const task of priorityTasks.value) {
    content += `- [ ] ${task}\n`;
  }
  
  content += '\n# Other\n\n';
  for (const task of otherTasks.value) {
    content += `- [ ] ${task}\n`;
  }
  
  content += '\n# Done\n\n';
  for (const task of doneTasks.value) {
    content += `- [x] ${task}\n`;
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

// Handle checkbox for Other tasks (unchecking moves to Priority)
async function handleOtherTaskCheck(section, index) {
  const task = otherTasks.value.splice(index, 1)[0];
  priorityTasks.value.unshift(task);
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
  
  // Only allow reordering within Priority or Other, not to/from Done
  if (targetSection === 'Done' || sourceSection === 'Done') {
    draggedItem.value = null;
    return;
  }
  
  // Get the task being dragged
  let task;
  if (sourceSection === 'Priority') {
    task = priorityTasks.value[sourceIndex];
  } else if (sourceSection === 'Other') {
    task = otherTasks.value[sourceIndex];
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
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #ccc;
}

.tabs button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.3s;
}

.tabs button.active {
  color: rgba(255, 255, 255, 0.87);
  border-bottom-color: #646cff;
}

.tabs button:hover {
  color: rgba(255, 255, 255, 0.87);
}

.add-task {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

.add-task input {
  flex: 1;
}

.error {
  color: #ff4444;
  padding: 0.5rem;
  margin-bottom: 1rem;
  background-color: rgba(255, 68, 68, 0.1);
  border-radius: 4px;
}

.lists-container {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.task-list {
  width: 100%;
}

.task-list h2 {
  margin-top: 0;
  margin-bottom: 1rem;
}

.task-list ul {
  list-style: none;
  padding: 0;
  min-height: 100px;
  border: 1px dashed #ccc;
  border-radius: 4px;
  padding: 0.5rem;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  cursor: move;
}

.task-item.done {
  opacity: 0.7;
  cursor: default;
}

.task-item input[type="checkbox"] {
  cursor: pointer;
  margin-top: 0.25rem;
  flex-shrink: 0;
}

.task-item.done input[type="checkbox"] {
  cursor: default;
}

.task-item label {
  flex: 1;
  cursor: pointer;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.task-item.done label {
  text-decoration: line-through;
  cursor: default;
}

.markdown-editor {
  margin-top: 1rem;
}

.markdown-editor textarea {
  width: 100%;
  font-family: 'Courier New', monospace;
  resize: vertical;
}

.markdown-editor button {
  margin-top: 0.5rem;
}

@media (prefers-color-scheme: light) {
  .tabs button {
    color: rgba(0, 0, 0, 0.6);
  }
  
  .tabs button.active,
  .tabs button:hover {
    color: rgba(0, 0, 0, 0.87);
  }
}
</style>
