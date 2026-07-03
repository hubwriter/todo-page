<template>
  <section
    class="link-list"
    :class="{ 'is-open': isOpen }"
    :aria-labelledby="headingId"
    @mouseenter="hovered = true"
    @mouseleave="hovered = false"
  >
    <h2 :id="headingId" class="link-heading">
      <span class="link-caret" aria-hidden="true">{{ isOpen ? '▾' : '▸' }}</span>
      {{ category }}
    </h2>
    <ul
      v-show="isOpen"
      class="link-box"
      @drop="handleDrop"
      @dragover.prevent
      @dragenter.prevent
    >
      <li
        v-for="link in links"
        :key="link.id"
        class="link-item"
        :draggable="true"
        @dragstart="$emit('dragstart', $event, category, link.id)"
        @dragend="$emit('dragend')"
        @dblclick="$emit('show-context-menu', $event, category, link.id)"
      >
        <a
          v-if="isSafeLinkUrl(link.url)"
          :href="link.url"
          class="link-url"
          draggable="false"
          @click="onLinkClick($event, link.url)"
        >{{ link.url }}</a>
        <span v-else class="link-url link-url--invalid">{{ link.url }}</span>
        <span class="link-separator">{{ ' — ' }}</span>
        <span class="link-description" v-html="renderMarkdown(link.description)"></span>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import { isSafeLinkUrl } from '../utils/linkUtils.js';
import { calculateDropPosition } from '../utils/taskUtils.js';
import { renderMarkdown } from '../utils/markdownUtils.js';

const props = defineProps({
  category: {
    type: String,
    required: true
  },
  links: {
    type: Array,
    required: true
  },
  // When true the box is always shown; otherwise it only shows on hover
  expanded: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['dragstart', 'dragend', 'drop', 'show-context-menu']);

// Local hover state; the box is open when hovered or force-expanded
const hovered = ref(false);
const isOpen = computed(() => props.expanded || hovered.value);

const headingId = computed(() => {
  const slug = props.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `links-category-${slug || 'unnamed'}`;
});

function handleDrop(event) {
  const targetIndex = calculateDropPosition(event, event.currentTarget);
  emit('drop', event, props.category, targetIndex);
}

function isFileUrl(url) {
  return /^file:\/\//i.test(String(url).trim());
}

function fileUrlToPath(url) {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return String(url).replace(/^file:\/\//i, '');
  }
}

// Browsers block navigation to file:// URLs from an http(s) page, so open the
// file through the server proxy (which serves it over http) instead.
function onLinkClick(event, url) {
  if (!isFileUrl(url)) return;
  event.preventDefault();
  const proxyUrl = `/api/local-file?path=${encodeURIComponent(fileUrlToPath(url))}`;
  window.location.assign(proxyUrl);
}
</script>

<style scoped>
.link-list {
  width: 100%;
  padding: 0.75rem;
}

/* Alternating light tints make each hover/expand area visible, and the sections
   butt together (no gap) so moving between them immediately swaps which is open */
.link-list:nth-child(odd) {
  background-color: #f2f4fa;
}

.link-list:nth-child(even) {
  background-color: #e6eaf4;
}

.link-list h2 {
  margin-top: 0;
  margin-bottom: 0;
}

.link-list.is-open h2 {
  margin-bottom: 0.6rem;
}

.link-heading {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.link-caret {
  font-size: 0.7em;
  color: rgba(0, 0, 0, 0.45);
}

.link-box {
  border: 1px dashed #ccc;
  border-radius: 4px;
  margin: 0;
  padding: 0.6rem 0.6rem 0.6rem 1.7rem;
  list-style: disc;
  background-color: #ffffff;
}

.link-item {
  display: list-item;
  list-style: disc;
  margin-bottom: 0.35rem;
  padding-left: 0.2rem;
  cursor: move;
  user-select: none;
  word-break: break-word;
}

.link-item:last-child {
  margin-bottom: 0;
}

.link-url {
  color: #0066cc;
  text-decoration: underline;
  word-break: break-all;
}

.link-url:hover {
  color: #0052a3;
}

.link-url--invalid {
  color: #ff4444;
  text-decoration: none;
  cursor: text;
}

.link-separator {
  white-space: pre;
}

.link-description {
  word-break: break-word;
}
</style>
