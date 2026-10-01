import { ref } from 'vue';

const activeConflict = ref(null);
const pendingConflicts = [];
let nextRevision = 1;

function withRevision(workflow) {
  workflow.revision = nextRevision++;
  return workflow;
}

function usableFocusTarget(target) {
  return target?.isConnected ? target : null;
}

function showNext() {
  if (!activeConflict.value) {
    activeConflict.value = pendingConflicts.shift() || null;
  }
}

export function queueConflictDialog(workflow) {
  const currentWorkflow = activeConflict.value?.resource === workflow.resource
    ? activeConflict.value
    : null;
  workflow.focusReturnTarget = usableFocusTarget(workflow.focusReturnTarget)
    || usableFocusTarget(currentWorkflow?.focusReturnTarget)
    || usableFocusTarget(document.activeElement);
  const revisedWorkflow = withRevision(workflow);
  if (currentWorkflow) {
    activeConflict.value = revisedWorkflow;
    return;
  }
  const existing = pendingConflicts.findIndex((item) => item.resource === workflow.resource);
  if (existing !== -1) pendingConflicts.splice(existing, 1);
  pendingConflicts.push(revisedWorkflow);
  showNext();
}

export function closeConflictDialog(resource) {
  if (activeConflict.value?.resource === resource) {
    activeConflict.value = null;
    showNext();
  } else {
    const index = pendingConflicts.findIndex((item) => item.resource === resource);
    if (index !== -1) pendingConflicts.splice(index, 1);
  }
}

export function useConflictDialogQueue() {
  return { activeConflict };
}
