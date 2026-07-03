import { describe, it, expect } from 'vitest';
import { useContextMenu } from '../../src/composables/useContextMenu.js';

function makeEvent(overrides = {}) {
  return {
    target: { tagName: 'LI' },
    clientX: 10,
    clientY: 20,
    preventDefault() {},
    ...overrides
  };
}

describe('useContextMenu', () => {
  it('shows the menu at the event position', () => {
    const { contextMenu, showContextMenu } = useContextMenu();
    showContextMenu(makeEvent(), 'Priority', 2, 'Task text');
    expect(contextMenu.value.show).toBe(true);
    expect(contextMenu.value.x).toBe(10);
    expect(contextMenu.value.y).toBe(20);
    expect(contextMenu.value.listType).toBe('Priority');
    expect(contextMenu.value.taskIndex).toBe(2);
    expect(contextMenu.value.taskText).toBe('Task text');
  });

  it('does not show the menu when clicking a link', () => {
    const { contextMenu, showContextMenu } = useContextMenu();
    showContextMenu(makeEvent({ target: { tagName: 'A' } }), 'Priority', 0, 't');
    expect(contextMenu.value.show).toBe(false);
  });

  it('closes the menu', () => {
    const { contextMenu, showContextMenu, closeContextMenu } = useContextMenu();
    showContextMenu(makeEvent(), 'Other', 0, 't');
    closeContextMenu();
    expect(contextMenu.value.show).toBe(false);
  });

  it('closes on Escape via handleEscKey', () => {
    const { contextMenu, showContextMenu, handleEscKey } = useContextMenu();
    showContextMenu(makeEvent(), 'Other', 0, 't');
    handleEscKey({ key: 'Escape' });
    expect(contextMenu.value.show).toBe(false);
  });

  it('getMenuContext returns the current selection', () => {
    const { showContextMenu, getMenuContext } = useContextMenu();
    showContextMenu(makeEvent(), 'Done', 3, 'done task');
    expect(getMenuContext()).toEqual({ listType: 'Done', taskIndex: 3, taskText: 'done task' });
  });
});
