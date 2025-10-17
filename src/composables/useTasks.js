// Composable for task management logic
import { ref } from 'vue';
import { loadTodoContent, saveTodoContent } from '../api/todoApi.js';
import {
  parseMarkdownToTasks,
  generateMarkdownFromTasks,
  addDateToTask,
  removeDateFromTask
} from '../utils/markdownUtils.js';
import { moveTask, getTaskList } from '../utils/taskUtils.js';

export function useTasks() {
  const priorityTasks = ref([]);
  const otherTasks = ref([]);
  const doneTasks = ref([]);
  const error = ref('');

  /**
   * Get reactive task lists
   */
  const getTaskLists = () => ({
    priority: priorityTasks.value,
    other: otherTasks.value,
    done: doneTasks.value
  });

  /**
   * Load tasks from server
   */
  async function loadTasks() {
    try {
      error.value = '';
      const content = await loadTodoContent();
      const parsed = parseMarkdownToTasks(content);
      priorityTasks.value = parsed.priority;
      otherTasks.value = parsed.other;
      doneTasks.value = parsed.done;
      return content;
    } catch (err) {
      error.value = `Error loading tasks: ${err.message}`;
      console.error('Error loading tasks:', err);
      // Don't throw - let the UI continue to work with existing data
      return null;
    }
  }

  /**
   * Save tasks to server
   */
  async function saveTasks() {
    try {
      error.value = '';
      const content = generateMarkdownFromTasks(
        priorityTasks.value,
        otherTasks.value,
        doneTasks.value
      );
      await saveTodoContent(content);
      return content;
    } catch (err) {
      error.value = `Error saving tasks: ${err.message}`;
      console.error('Error saving tasks:', err);
      throw err;
    }
  }

  /**
   * Complete a task (move to Done with date)
   */
  async function completeTask(section, index) {
    const lists = getTaskLists();
    const sourceList = getTaskList(section, lists);

    moveTask({
      sourceList,
      sourceIndex: index,
      targetList: doneTasks.value,
      targetIndex: 0,
      transformTask: addDateToTask
    });

    await saveTasks();
  }

  /**
   * Uncomplete a task (move from Done back to Priority)
   */
  async function uncompleteTask(index) {
    moveTask({
      sourceList: doneTasks.value,
      sourceIndex: index,
      targetList: priorityTasks.value,
      targetIndex: 0,
      transformTask: removeDateFromTask
    });

    await saveTasks();
  }

  /**
   * Delete a task
   */
  async function deleteTask(section, index) {
    const lists = getTaskLists();
    const targetList = getTaskList(section, lists);
    targetList.splice(index, 1);
    await saveTasks();
  }

  /**
   * Move task between sections
   */
  async function moveTaskBetweenSections(fromSection, toSection, index, targetIndex = 0) {
    const lists = getTaskLists();
    const sourceList = getTaskList(fromSection, lists);
    const targetList = getTaskList(toSection, lists);

    // Don't transform Done tasks - they keep their date prefix
    const transformTask = fromSection === 'Done' ? removeDateFromTask : null;

    moveTask({
      sourceList,
      sourceIndex: index,
      targetList,
      targetIndex,
      transformTask
    });

    await saveTasks();
  }

  return {
    // State
    priorityTasks,
    otherTasks,
    doneTasks,
    error,

    // Methods
    loadTasks,
    saveTasks,
    completeTask,
    uncompleteTask,
    deleteTask,
    moveTaskBetweenSections,
    getTaskLists
  };
}
