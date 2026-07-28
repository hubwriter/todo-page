<template>
  <section class="backups-tab" aria-labelledby="backups-heading">
    <h2 id="backups-heading">Backups</h2>
    <p class="backups-intro">
      A backup is saved automatically every time your tasks change. The 10 most
      recent backups are kept. Select a backup to preview it on the Tasks tab.
    </p>

    <p v-if="error" class="backups-error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="backups-status">Loading backups…</p>
    <p v-else-if="backups.length === 0" class="backups-status">
      No backups yet. A backup is created the next time your tasks change.
    </p>

    <ul v-else class="backups-list">
      <li v-for="backup in backups" :key="backup.filename">
        <button
          type="button"
          class="backup-item"
          @click="$emit('view-backup', backup.filename)"
        >
          <span class="backup-icon" aria-hidden="true">🕑</span>
          <span class="backup-details">
            <span class="backup-date">{{ formatBackupDate(backup.timestamp) }}</span>
            <span class="backup-relative">{{ relativeTime(backup.timestamp) }}</span>
          </span>
          <span class="backup-action">Preview →</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { loadBackups } from '../api/backupsApi.js';

const props = defineProps({
  active: {
    type: Boolean,
    default: false
  }
});

defineEmits(['view-backup']);

const backups = ref([]);
const error = ref('');
const loading = ref(false);

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    backups.value = await loadBackups();
  } catch (err) {
    error.value = `Error loading backups: ${err.message}`;
    backups.value = [];
  } finally {
    loading.value = false;
  }
}

function formatBackupDate(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function relativeTime(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const units = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
    ['second', 1]
  ];
  for (const [unit, unitSeconds] of units) {
    if (seconds >= unitSeconds || unit === 'second') {
      return rtf.format(-Math.round(seconds / unitSeconds), unit);
    }
  }
  return '';
}

// Refresh the list whenever the tab becomes active (so newly created backups show).
watch(
  () => props.active,
  (isActive) => {
    if (isActive) refresh();
  }
);

onMounted(() => {
  if (props.active) refresh();
});
</script>

<style scoped>
.backups-tab {
  margin-top: 0.5rem;
  color: #213547;
}

.backups-tab h2 {
  margin-top: 0;
}

.backups-intro {
  color: #4a5b6b;
  margin-bottom: 1.25rem;
  max-width: 60ch;
}

.backups-status {
  color: #4a5b6b;
  padding: 1rem;
  background: #f4f6f8;
  border: 1px dashed #c9d2da;
  border-radius: 8px;
}

.backups-error {
  color: #b00020;
  padding: 0.6rem 0.8rem;
  background-color: #fdecef;
  border: 1px solid #f5c2cb;
  border-radius: 6px;
}

.backups-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.backup-item {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  text-align: left;
  padding: 0.75rem 1rem;
  border: 1px solid #d7dee5;
  border-radius: 8px;
  background: #ffffff;
  color: #213547;
  cursor: pointer;
  font-size: 0.95rem;
  transition: border-color 0.15s, box-shadow 0.15s, background-color 0.15s;
}

.backup-item:hover,
.backup-item:focus-visible {
  background: #f5f7ff;
  border-color: #646cff;
  box-shadow: 0 1px 4px rgba(100, 108, 255, 0.2);
  outline: none;
}

.backup-icon {
  font-size: 1.1rem;
  line-height: 1;
  flex-shrink: 0;
}

.backup-details {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.backup-date {
  font-weight: 600;
  color: #1b2b38;
}

.backup-relative {
  font-size: 0.82rem;
  color: #6a7a88;
}

.backup-action {
  flex-shrink: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: #646cff;
}
</style>
