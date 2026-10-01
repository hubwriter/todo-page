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
        <div class="task-text" v-html="renderMarkdown(task, { inline: false })"></div>
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

</script>

<style scoped>
.task-list {
  width: 100%;
}

.task-list > h2 {
  margin-top: 0;
  margin-bottom: 0.6rem;
}

.task-list > ul {
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
  min-width: 0;
  word-wrap: break-word;
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

.task-text :deep(p),
.task-text :deep(ul),
.task-text :deep(ol),
.task-text :deep(pre),
.task-text :deep(blockquote) {
  margin: 0.5rem 0;
}

.task-text :deep(ul),
.task-text :deep(ol) {
  padding-left: 1.5rem;
}

.task-text :deep(li > ul),
.task-text :deep(li > ol) {
  margin: 0;
}

.task-text :deep(> :first-child) {
  margin-top: 0;
}

.task-text :deep(> :last-child) {
  margin-bottom: 0;
}

.task-text :deep(pre) {
  overflow-x: auto;
  white-space: pre;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.05);
}

.task-text :deep(blockquote) {
  padding-left: 0.75rem;
  border-left: 3px solid #ccc;
}

.task-text :deep(table) {
  border-collapse: collapse;
}

.task-text :deep(th),
.task-text :deep(td) {
  border: 1px solid #ccc;
  padding: 0.25rem 0.5rem;
}
</style>
