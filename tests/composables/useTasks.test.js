import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/todoApi.js', () => ({
  loadTodoContent: vi.fn(),
  saveTodoContent: vi.fn(() => Promise.resolve())
}));

import { loadTodoContent, saveTodoContent } from '../../src/api/todoApi.js';
import { useTasks } from '../../src/composables/useTasks.js';

beforeEach(() => {
  vi.clearAllMocks();
  saveTodoContent.mockResolvedValue(undefined);
});

describe('useTasks', () => {
  it('loads and parses tasks from the server', async () => {
    loadTodoContent.mockResolvedValue(
      '# Priority\n\n- [ ] A\n\n# Other\n\n- [ ] B\n\n# Done\n\n- [x] 2025-01-01 - C\n'
    );
    const { priorityTasks, otherTasks, doneTasks, loadTasks } = useTasks();
    await loadTasks();
    expect(priorityTasks.value).toEqual(['A']);
    expect(otherTasks.value).toEqual(['B']);
    expect(doneTasks.value).toEqual(['2025-01-01 - C']);
  });

  it('saveTasks serializes the lists and posts them', async () => {
    const { priorityTasks, saveTasks } = useTasks();
    priorityTasks.value = ['Task'];
    await saveTasks();
    expect(saveTodoContent).toHaveBeenCalledOnce();
    expect(saveTodoContent.mock.calls[0][0]).toContain('- [ ] Task');
  });

  it('completeTask moves a task to Done with a date', async () => {
    const { priorityTasks, doneTasks, completeTask } = useTasks();
    priorityTasks.value = ['Finish me'];
    await completeTask('Priority', 0);
    expect(priorityTasks.value).toEqual([]);
    expect(doneTasks.value[0]).toMatch(/^\d{4}-\d{2}-\d{2} - Finish me$/);
    expect(saveTodoContent).toHaveBeenCalled();
  });

  it('uncompleteTask moves a task back to Priority without a date', async () => {
    const { priorityTasks, doneTasks, uncompleteTask } = useTasks();
    doneTasks.value = ['2025-01-01 - Was done'];
    await uncompleteTask(0);
    expect(doneTasks.value).toEqual([]);
    expect(priorityTasks.value).toEqual(['Was done']);
  });

  it('deleteTask removes a task', async () => {
    const { otherTasks, deleteTask } = useTasks();
    otherTasks.value = ['A', 'B'];
    await deleteTask('Other', 0);
    expect(otherTasks.value).toEqual(['B']);
  });

  it('moveTaskBetweenSections moves tasks', async () => {
    const { priorityTasks, otherTasks, moveTaskBetweenSections } = useTasks();
    priorityTasks.value = ['A'];
    otherTasks.value = [];
    await moveTaskBetweenSections('Priority', 'Other', 0, 0);
    expect(priorityTasks.value).toEqual([]);
    expect(otherTasks.value).toEqual(['A']);
  });

  it('surfaces load errors without throwing', async () => {
    loadTodoContent.mockRejectedValue(new Error('boom'));
    const { error, loadTasks } = useTasks();
    const result = await loadTasks();
    expect(result).toBeNull();
    expect(error.value).toContain('boom');
  });
});
