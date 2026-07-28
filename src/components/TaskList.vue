<template>
  <section class="task-list" :aria-labelledby="`${listType.toLowerCase()}-heading`">
    <h2 :id="`${listType.toLowerCase()}-heading`">{{ listType }}</h2>
    <ul
      @drop="handleDrop"
      @dragover.prevent
      @dragenter.prevent
    >
      <li
        v-for="(task, index) in tasks"
        :key="`${listType.toLowerCase()}-${task}-${index}`"
        :draggable="!readOnly"
        @dragstart="handleDragStart($event, index)"
        @dblclick="handleDblClick($event, index, task)"
        @click="handleClick($event, index, task)"
        class="task-item"
        :class="{ done: listType === 'Done', 'read-only': readOnly }"
      >
        <input
          type="checkbox"
          :id="`${listType.toLowerCase()}-${index}`"
          :checked="listType === 'Done'"
          :disabled="readOnly"
          @change="handleCheckboxChange(index)"
          :aria-label="getCheckboxLabel(task)"
        />
        <div class="task-text">
          <span class="task-first-line" v-html="renderFirstLine(task)"></span>
          <span v-if="hasMultipleLines(task)" class="task-continuation">
            <span
              v-for="(line, lineIndex) in getContinuationLines(task)"
              :key="lineIndex"
              class="task-indent"
              v-html="renderLine(line)"
            ></span>
          </span>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { renderMarkdown } from '../utils/markdownUtils.js';

const props = defineProps({
  listType: {
    type: String,
    required: true,
    validator: (value) => ['Priority', 'Other', 'Done'].includes(value)
  },
  tasks: {
    type: Array,
    required: true
  },
  readOnly: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['dragstart', 'drop', 'show-context-menu', 'checkbox-change', 'edit-task']);

function handleDrop(event) {
  if (props.readOnly) return;
  emit('drop', event, props.listType);
}

function handleDragStart(event, index) {
  if (props.readOnly) return;
  emit('dragstart', event, props.listType, index);
}

function handleDblClick(event, index, task) {
  if (props.readOnly) return;
  emit('show-context-menu', event, props.listType, index, task);
}

function handleClick(event, index, task) {
  if (props.readOnly) return;
  // Command-click (or Ctrl-click on non-Mac) opens the task for editing
  if (event.metaKey || event.ctrlKey) {
    if (event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    emit('edit-task', props.listType, index, task);
  }
}

function handleCheckboxChange(index) {
  if (props.readOnly) return;
  emit('checkbox-change', props.listType, index);
}

function getCheckboxLabel(task) {
  const firstLine = task.split('\n')[0];
  if (props.listType === 'Done') {
    return `Uncomplete: ${firstLine}`;
  } else if (props.listType === 'Other') {
    return `Process ${firstLine}`;
  } else {
    return `Mark ${firstLine} as complete`;
  }
}

function hasMultipleLines(task) {
  return task.includes('\n');
}

function renderFirstLine(task) {
  return renderMarkdown(task.split('\n')[0]);
}

function getContinuationLines(task) {
  return task.split('\n').slice(1);
}

function renderLine(line) {
  return renderMarkdown(line);
}
</script>

<style scoped>
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
  user-select: none;
}

.task-item input[type="checkbox"] {
  cursor: pointer;
  margin-top: 0.25rem;
  flex-shrink: 0;
}

.task-item.read-only {
  cursor: default;
}

.task-item.read-only input[type="checkbox"] {
  cursor: default;
}

.task-text {
  flex: 1;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.task-text :deep(a) {
  color: #0066cc !important;
  text-decoration: underline !important;
}

.task-text :deep(a:visited) {
  color: #0066cc !important;
}

.task-text :deep(a:hover) {
  color: #0052a3 !important;
}

.task-text :deep(img) {
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
</style>
