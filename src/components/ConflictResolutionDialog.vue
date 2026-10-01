<template>
  <div class="conflict-backdrop" @keydown.stop @click.stop>
    <section
      ref="dialog"
      class="conflict-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <h2 :id="headingId">Resolve {{ workflow.resourceName }} conflict</h2>
      <p class="conflict-step">Conflict {{ index + 1 }} of {{ conflicts.length }}</p>
      <h3>{{ current.label }}</h3>

      <div class="conflict-columns">
        <div>
          <strong>Current change</strong>
          <pre>{{ current.current }}</pre>
          <button type="button" @click="choose(current.current)">Use Current change</button>
        </div>
        <div>
          <strong>Other change</strong>
          <pre>{{ current.other }}</pre>
          <button type="button" @click="choose(current.other)">Use Other change</button>
        </div>
      </div>

      <details>
        <summary>Base context</summary>
        <pre>{{ current.base }}</pre>
      </details>

      <label :for="resolutionId">Resolution</label>
      <textarea
        :id="resolutionId"
        ref="resolutionField"
        v-model="current.resolution"
        v-edit-history="historySession"
        rows="8"
        @input="editResolution"
      ></textarea>

      <p v-if="validationError" class="conflict-error" role="alert">{{ validationError }}</p>

      <label v-if="workflow.requiresReplacementConfirmation" class="replacement-confirmation">
        <input v-model="replacementConfirmed" type="checkbox" @change="persistProgress" />
        {{ workflow.replacementConfirmationLabel }}
      </label>

      <div class="conflict-actions">
        <button type="button" :disabled="index === 0" @click="previous">Previous</button>
        <button type="button" class="btn-secondary" @click="cancel">Cancel and keep editing</button>
        <button type="button" class="btn-primary" :disabled="applying" @click="applyAndNext">
          {{ index === conflicts.length - 1 ? 'Apply and save' : 'Apply and next' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { vEditHistory } from '../utils/editHistory.js';

const props = defineProps({
  workflow: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['closed']);
const conflicts = ref([]);
const index = ref(0);
const dialog = ref(null);
const resolutionField = ref(null);
const validationError = ref('');
const replacementConfirmed = ref(false);
const applying = ref(false);
const current = computed(() => conflicts.value[index.value]);
const historySession = computed(() =>
  `${props.workflow.revision ?? 0}:${current.value?.id ?? ''}`
);
const headingId = `conflict-heading-${props.workflow.resource}`;
const resolutionId = `conflict-resolution-${props.workflow.resource}`;

function restoreFocus() {
  const previouslyFocused = props.workflow.focusReturnTarget;
  if (
    previouslyFocused?.isConnected &&
    !previouslyFocused.hidden &&
    !previouslyFocused.disabled &&
    previouslyFocused.tabIndex >= 0
  ) {
    previouslyFocused.focus();
  }
}

function resetWorkflow() {
  conflicts.value = props.workflow.conflicts.map((conflict) => ({ ...conflict }));
  index.value = Math.min(props.workflow.currentIndex ?? 0, Math.max(conflicts.value.length - 1, 0));
  validationError.value = '';
  replacementConfirmed.value = props.workflow.replacementConfirmed === true;
  nextTick(() => resolutionField.value?.focus());
}

function persistProgress() {
  props.workflow.updateDraft?.(
    conflicts.value.map((conflict) => ({ ...conflict })),
    {
      currentIndex: index.value,
      replacementConfirmed: replacementConfirmed.value
    }
  );
}

function choose(value) {
  current.value.resolution = value;
  current.value.resolved = true;
  persistProgress();
  nextTick(() => resolutionField.value?.focus());
}

function editResolution() {
  current.value.resolved = true;
  persistProgress();
}

function previous() {
  if (index.value > 0) {
    index.value--;
    persistProgress();
  }
}

async function applyAndNext() {
  validationError.value = '';
  current.value.resolved = true;
  if (index.value < conflicts.value.length - 1) {
    index.value++;
    persistProgress();
    nextTick(() => resolutionField.value?.focus());
    return;
  }
  if (conflicts.value.some((conflict) => !conflict.resolved)) {
    validationError.value = 'Resolve every conflict before saving.';
    return;
  }
  const validation = props.workflow.validate?.(conflicts.value);
  if (validation && !validation.valid) {
    validationError.value = validation.error;
    return;
  }
  if (props.workflow.requiresReplacementConfirmation && !replacementConfirmed.value) {
    validationError.value = 'Confirm that you want to replace the invalid links file.';
    return;
  }
  applying.value = true;
  try {
    if (props.workflow.requiresReplacementConfirmation) {
      const result = await props.workflow.apply(conflicts.value, { replacementConfirmed: true });
      if (result === null) return;
    } else {
      const result = await props.workflow.apply(conflicts.value);
      if (result === null) return;
    }
  } catch (applyFailure) {
    validationError.value = applyFailure.userMessage
      || 'Could not apply this resolution. Your choices are still here; check your connection and try again.';
    await nextTick();
    resolutionField.value?.focus();
    return;
  } finally {
    applying.value = false;
  }
  emit('closed');
  restoreFocus();
}

function cancel() {
  props.workflow.cancel(conflicts.value);
  emit('closed');
  restoreFocus();
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    cancel();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.value.querySelectorAll(
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden);
  if (!focusable.length) return;
  const activeElement = dialog.value.contains(event.target) ? event.target : document.activeElement;
  const currentIndex = focusable.indexOf(activeElement);
  if (event.shiftKey && currentIndex === 0) {
    event.preventDefault();
    focusable.at(-1).focus();
  } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
    event.preventDefault();
    focusable[0].focus();
  }
}

onMounted(() => {
  if (!props.workflow.focusReturnTarget?.isConnected) {
    props.workflow.focusReturnTarget = document.activeElement;
  }
  dialog.value?.focus();
});

watch(() => props.workflow, resetWorkflow, { immediate: true });
</script>

<style scoped>
.conflict-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.55);
}

.conflict-dialog {
  width: min(900px, 100%);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.25rem;
  border-radius: 10px;
  background: white;
  color: #213547;
}

.conflict-step {
  color: #596b7a;
}

.conflict-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

pre {
  min-height: 4rem;
  overflow: auto;
  padding: 0.75rem;
  border: 1px solid #d7dee5;
  border-radius: 6px;
  background: #f6f8fa;
  white-space: pre-wrap;
}

textarea {
  width: 100%;
  margin-top: 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

.replacement-confirmation {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin-top: 1rem;
}

.conflict-error {
  color: #b00020;
}

@media (max-width: 700px) {
  .conflict-columns {
    grid-template-columns: 1fr;
  }
}
</style>
