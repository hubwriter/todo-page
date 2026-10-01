import { computed, ref } from 'vue';
import { loadTodoContent, saveTodoContent } from '../api/todoApi.js';
import { ConflictError } from '../api/resourceErrors.js';
import {
  parseMarkdownToTasks,
  generateMarkdownFromTasks,
  addDateToTask,
  removeDateFromTask
} from '../utils/markdownUtils.js';
import { mergeMarkdown } from '../utils/markdownMerge.js';
import { moveTask, getTaskList } from '../utils/taskUtils.js';
import { useConflictAwareSave } from './useConflictAwareSave.js';

function cloneLists(lists) {
  return {
    priority: [...lists.priority],
    other: [...lists.other],
    done: [...lists.done],
    markdownContent: lists.markdownContent,
    dirty: lists.dirty
  };
}

export function useTasks() {
  const priorityTasks = ref([]);
  const otherTasks = ref([]);
  const doneTasks = ref([]);
  const markdownContent = ref('');
  const loadError = ref('');

  const coordinator = useConflictAwareSave({
    resource: 'todo',
    loadRemote: loadTodoContent,
    saveRemote: saveTodoContent,
    merge: mergeMarkdown,
    snapshotFromResponse: (response) => response.content,
    onCandidate: applyContent,
    onAccepted: applyContent
  });

  const error = computed({
    get: () => coordinator.error.value || loadError.value,
    set: (value) => {
      loadError.value = value;
      if (!value) coordinator.error.value = '';
    }
  });

  const getTaskLists = () => ({
    priority: priorityTasks.value,
    other: otherTasks.value,
    done: doneTasks.value
  });

  function applyContent(content) {
    markdownContent.value = content;
    const parsed = parseMarkdownToTasks(content);
    priorityTasks.value = parsed.priority;
    otherTasks.value = parsed.other;
    doneTasks.value = parsed.done;
    return content;
  }

  function snapshotTasks() {
    return cloneLists({
      ...getTaskLists(),
      markdownContent: markdownContent.value,
      dirty: coordinator.dirty.value
    });
  }

  function restoreTasks(snapshot) {
    priorityTasks.value = [...snapshot.priority];
    otherTasks.value = [...snapshot.other];
    doneTasks.value = [...snapshot.done];
    markdownContent.value = snapshot.markdownContent;
  }

  async function loadTasks({ preserveLocal = false } = {}) {
    try {
      loadError.value = '';
      const response = await loadTodoContent();
      if (!coordinator.version.value) {
        return applyContent(coordinator.initialize(response));
      }
      if (preserveLocal || coordinator.dirty.value || coordinator.resolving.value) {
        coordinator.noteExternalVersion(response.version);
        return markdownContent.value;
      }
      return applyContent(coordinator.adopt(response));
    } catch (loadFailure) {
      loadError.value = loadFailure.userMessage || 'Could not load tasks. Check that the app server is running, then reload the page.';
      console.error('Error loading tasks:', loadFailure);
      return null;
    }
  }

  async function saveContent(content) {
    markdownContent.value = content;
    return coordinator.save(content);
  }

  function markContentDirty(content) {
    markdownContent.value = content;
    coordinator.markDirty(content);
  }

  function restoreLocalCandidate(content) {
    applyContent(content);
    coordinator.markDirty(content);
  }

  async function saveTasks(snapshot = null) {
    const content = generateMarkdownFromTasks(
      priorityTasks.value,
      otherTasks.value,
      doneTasks.value
    );
    markdownContent.value = content;
    try {
      await saveContent(content);
      return content;
    } catch (saveFailure) {
      if (saveFailure instanceof ConflictError || coordinator.preserveCandidateOnFailure.value) {
        applyContent(coordinator.localCandidate.value);
      } else if (snapshot) {
        restoreTasks(snapshot);
        coordinator.restoreCandidate(snapshot.markdownContent, snapshot.dirty);
      }
      throw saveFailure;
    }
  }

  async function mutateAndSave(mutation) {
    const snapshot = snapshotTasks();
    mutation();
    return saveTasks(snapshot);
  }

  async function completeTask(section, index) {
    return mutateAndSave(() => {
      const lists = getTaskLists();
      moveTask({
        sourceList: getTaskList(section, lists),
        sourceIndex: index,
        targetList: doneTasks.value,
        targetIndex: 0,
        transformTask: addDateToTask
      });
    });
  }

  async function uncompleteTask(index) {
    return mutateAndSave(() => {
      moveTask({
        sourceList: doneTasks.value,
        sourceIndex: index,
        targetList: priorityTasks.value,
        targetIndex: 0,
        transformTask: removeDateFromTask
      });
    });
  }

  async function deleteTask(section, index) {
    return mutateAndSave(() => {
      getTaskList(section, getTaskLists()).splice(index, 1);
    });
  }

  async function moveTaskBetweenSections(fromSection, toSection, index, targetIndex = 0) {
    return mutateAndSave(() => {
      const lists = getTaskLists();
      moveTask({
        sourceList: getTaskList(fromSection, lists),
        sourceIndex: index,
        targetList: getTaskList(toSection, lists),
        targetIndex,
        transformTask: fromSection === 'Done' ? removeDateFromTask : null
      });
    });
  }

  async function replaceFromBackup(content, previewVersion, confirmReplacement) {
    return coordinator.replace(content, {
      previewVersion,
      confirmReplacement
    });
  }

  return {
    priorityTasks,
    otherTasks,
    doneTasks,
    markdownContent,
    error,
    version: coordinator.version,
    dirty: coordinator.dirty,
    resolving: coordinator.resolving,
    externalChange: coordinator.externalChange,
    unresolved: coordinator.unresolved,
    contention: coordinator.contention,
    inFlight: coordinator.inFlight,
    pendingOperations: coordinator.pendingOperations,
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
    restoreTasks,
    getTaskLists,
    noteExternalVersion: coordinator.noteExternalVersion
  };
}
