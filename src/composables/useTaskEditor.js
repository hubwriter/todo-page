// Composable for task editing functionality
import { ref } from 'vue';
import { FOCUS_DELAY_MS, SCROLL_DELAY_MS, HIGHLIGHT_DURATION_MS } from '../constants.js';

export function useTaskEditor() {
  const newTask = ref('');

  const editingTask = ref({
    isEditing: false,
    originalList: '',
    originalIndex: -1,
    originalText: ''
  });

  /**
   * Start editing a task
   */
  function startEdit(listType, index, taskText) {
    editingTask.value = {
      isEditing: true,
      originalList: listType,
      originalIndex: index,
      originalText: taskText
    };
    newTask.value = taskText;

    // Focus the textarea after a brief delay
    setTimeout(() => {
      document.querySelector('textarea')?.focus();
    }, FOCUS_DELAY_MS);
  }

  /**
   * Cancel editing
   */
  function cancelEdit() {
    editingTask.value = {
      isEditing: false,
      originalList: '',
      originalIndex: -1,
      originalText: ''
    };
    newTask.value = '';
  }

  /**
   * Get editing state data
   */
  function getEditState() {
    return {
      isEditing: editingTask.value.isEditing,
      originalList: editingTask.value.originalList,
      originalIndex: editingTask.value.originalIndex,
      originalText: editingTask.value.originalText
    };
  }

  /**
   * Scroll to a specific task and highlight it
   */
  function scrollToTask(listType, index) {
    setTimeout(() => {
      const selectorMap = {
        'Priority': `#priority-${index}`,
        'Other': `#other-${index}`,
        'Done': `#done-${index}`
      };

      const selector = selectorMap[listType];
      if (!selector) return;

      const element = document.querySelector(selector);
      if (!element) return;

      const taskItem = element.closest('.task-item');
      if (taskItem) {
        taskItem.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Briefly highlight the task
        taskItem.style.backgroundColor = '#fff3cd';
        setTimeout(() => {
          taskItem.style.backgroundColor = '';
        }, HIGHLIGHT_DURATION_MS);
      }
    }, SCROLL_DELAY_MS);
  }

  return {
    newTask,
    editingTask,
    startEdit,
    cancelEdit,
    getEditState,
    scrollToTask
  };
}
