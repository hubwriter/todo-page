// Composable for context menu functionality
import { ref } from 'vue';

export function useContextMenu() {
  const contextMenu = ref({
    show: false,
    x: 0,
    y: 0,
    listType: '',
    taskIndex: -1,
    taskText: ''
  });

  /**
   * Show context menu at event position
   */
  function showContextMenu(event, listType, index, taskText) {
    // Don't show menu if clicking on a link
    if (event.target.tagName === 'A') {
      return;
    }

    event.preventDefault();

    contextMenu.value = {
      show: true,
      x: event.clientX,
      y: event.clientY,
      listType,
      taskIndex: index,
      taskText
    };
  }

  /**
   * Close context menu
   */
  function closeContextMenu() {
    contextMenu.value.show = false;
  }

  /**
   * Handle ESC key to close context menu
   */
  function handleEscKey(event) {
    if (event.key === 'Escape' && contextMenu.value.show) {
      closeContextMenu();
    }
  }

  /**
   * Get current context menu data
   */
  function getMenuContext() {
    return {
      listType: contextMenu.value.listType,
      taskIndex: contextMenu.value.taskIndex,
      taskText: contextMenu.value.taskText
    };
  }

  return {
    contextMenu,
    showContextMenu,
    closeContextMenu,
    handleEscKey,
    getMenuContext
  };
}
