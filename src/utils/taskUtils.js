// Task list manipulation utilities

/**
 * Move task from one list to another
 * @param {Object} params - Parameters
 * @param {Array} params.sourceList - Source task array
 * @param {number} params.sourceIndex - Index in source
 * @param {Array} params.targetList - Target task array
 * @param {number} params.targetIndex - Index in target (optional, defaults to start)
 * @param {Function} params.transformTask - Optional task transformation function
 * @returns {string} The moved task
 */
export function moveTask({ sourceList, sourceIndex, targetList, targetIndex = 0, transformTask = null }) {
  const [task] = sourceList.splice(sourceIndex, 1);
  const finalTask = transformTask ? transformTask(task) : task;
  targetList.splice(targetIndex, 0, finalTask);
  return finalTask;
}

/**
 * Calculate drop position for drag and drop
 * @param {DragEvent} event - Drop event
 * @param {HTMLElement} listElement - List container element
 * @returns {number} Target index
 */
export function calculateDropPosition(event, listElement) {
  const items = Array.from(listElement.children);
  let targetIndex = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const rect = item.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;

    if (event.clientY < middle) {
      targetIndex = i;
      break;
    }
  }

  return targetIndex;
}

/**
 * Get task list by section name
 * @param {string} section - Section name ('Priority', 'Other', or 'Done')
 * @param {Object} lists - Object containing task lists
 * @returns {Array} Task array
 */
export function getTaskList(section, lists) {
  const mapping = {
    'Priority': lists.priority,
    'Other': lists.other,
    'Done': lists.done
  };
  return mapping[section] || [];
}
