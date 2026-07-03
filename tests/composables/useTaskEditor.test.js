import { describe, it, expect } from 'vitest';
import { useTaskEditor } from '../../src/composables/useTaskEditor.js';

describe('useTaskEditor', () => {
  it('starts with no editing state', () => {
    const { getEditState, newTask } = useTaskEditor();
    expect(getEditState().isEditing).toBe(false);
    expect(newTask.value).toBe('');
  });

  it('startEdit populates the editing state and input', () => {
    const { startEdit, getEditState, newTask } = useTaskEditor();
    startEdit('Priority', 2, 'Edit me');
    const state = getEditState();
    expect(state.isEditing).toBe(true);
    expect(state.originalList).toBe('Priority');
    expect(state.originalIndex).toBe(2);
    expect(state.originalText).toBe('Edit me');
    expect(newTask.value).toBe('Edit me');
  });

  it('cancelEdit resets the state and input', () => {
    const { startEdit, cancelEdit, getEditState, newTask } = useTaskEditor();
    startEdit('Other', 1, 'x');
    cancelEdit();
    expect(getEditState().isEditing).toBe(false);
    expect(newTask.value).toBe('');
  });
});
