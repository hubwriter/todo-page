import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/todoApi.js', () => ({
  loadTodoContent: vi.fn(),
  saveTodoContent: vi.fn()
}));

import { loadTodoContent, saveTodoContent } from '../../src/api/todoApi.js';
import { ConflictError } from '../../src/api/resourceErrors.js';
import { useTasks } from '../../src/composables/useTasks.js';
import { useConflictDialogQueue } from '../../src/composables/useConflictDialogQueue.js';
import { parseMarkdownToTasks, generateMarkdownFromTasks, removeDateFromTask } from '../../src/utils/markdownUtils.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  let revision = 0;
  saveTodoContent.mockImplementation(async (content) => ({ content, version: `saved-${++revision}` }));
});

describe('useTasks', () => {
  it('preserves nested Markdown when moving, completing, reopening, and reloading tasks', async () => {
    const task = 'A list:\n- Parent\n  - Child\n\nAnother paragraph.\n\n```text\n  code\n```';
    let saved = generateMarkdownFromTasks([task], [], []);
    let revision = 0;
    loadTodoContent.mockImplementation(async () => ({ content: saved, version: `loaded-${revision}` }));
    saveTodoContent.mockImplementation(async content => {
      saved = content;
      return { content, version: `loaded-${++revision}` };
    });
    const tasks = useTasks();
    await tasks.loadTasks();
    await tasks.moveTaskBetweenSections('Priority', 'Other', 0);
    await tasks.loadTasks();
    expect(tasks.otherTasks.value).toEqual([task]);
    await tasks.completeTask('Other', 0);
    await tasks.loadTasks();
    expect(tasks.otherTasks.value).toEqual([]);
    expect(removeDateFromTask(parseMarkdownToTasks(saved).done[0])).toBe(task);
    await tasks.uncompleteTask(0);
    await tasks.loadTasks();
    expect(tasks.priorityTasks.value).toEqual([task]);
    expect(tasks.doneTasks.value).toEqual([]);
  });

  it('loads and parses tasks from the server', async () => {
    loadTodoContent.mockResolvedValue({
      content: '# Priority\n\n- [ ] A\n\n# Other\n\n- [ ] B\n\n# Done\n\n- [x] 2025-01-01 - C\n',
      version: 'v1'
    });
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
    expect(error.value).toContain('Check that the app server is running');
  });

  it('applies a dialog resolution to visible tasks and bases the next edit on its accepted version', async () => {
    const base = '# Priority\n\n- [ ] Base\n\n# Other\n\n# Done\n';
    const other = '# Priority\n\n- [ ] Other\n\n# Other\n\n# Done\n';
    saveTodoContent
      .mockRejectedValueOnce(new ConflictError('stale', { content: other, version: 'v2' }))
      .mockImplementationOnce(async () => ({
        content: '# Priority\n\n- [ ] Accepted Other\n\n# Other\n\n# Done\n',
        version: 'v3'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v4' }));
    loadTodoContent.mockResolvedValue({ content: base, version: 'v1' });
    const tasks = useTasks();
    await tasks.loadTasks();
    tasks.priorityTasks.value = ['Current'];
    await tasks.saveTasks();

    const active = useConflictDialogQueue().activeConflict.value;
    active.conflicts[0].resolution = 'Other';
    active.conflicts[0].resolved = true;
    await active.apply(active.conflicts);

    expect(tasks.priorityTasks.value).toEqual(['Accepted Other']);
    expect(tasks.markdownContent.value).toContain('- [ ] Accepted Other');
    tasks.priorityTasks.value = ['Accepted Other', 'Next'];
    await tasks.saveTasks();
    expect(saveTodoContent.mock.calls.at(-1)[0]).toContain('- [ ] Accepted Other');
    expect(saveTodoContent.mock.calls.at(-1)[1]).toBe('v3');
  });

  it('keeps a resolved candidate visible after an offline save and retries it unchanged', async () => {
    const base = '# Priority\n\n- [ ] Base\n\n# Other\n\n# Done\n';
    const other = '# Priority\n\n- [ ] Other\n\n# Other\n\n# Done\n';
    saveTodoContent
      .mockRejectedValueOnce(new ConflictError('stale', { content: other, version: 'v2' }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    loadTodoContent.mockResolvedValue({ content: base, version: 'v1' });
    const tasks = useTasks();
    await tasks.loadTasks();
    tasks.priorityTasks.value = ['Current'];
    await tasks.saveTasks();

    const active = useConflictDialogQueue().activeConflict.value;
    active.conflicts[0].resolution = active.conflicts[0].current.replace('Current', 'Resolved');
    active.conflicts[0].resolved = true;
    await expect(active.apply(active.conflicts)).rejects.toThrow('offline');

    expect(tasks.priorityTasks.value).toEqual(['Resolved']);
    expect(tasks.markdownContent.value).toContain('- [ ] Resolved');
    expect(tasks.dirty.value).toBe(true);

    await tasks.saveContent(tasks.markdownContent.value);
    expect(saveTodoContent.mock.calls.at(-1)).toEqual([
      expect.stringContaining('- [ ] Resolved'),
      'v2',
      {}
    ]);
  });

  it('restores a failed optimistic task mutation before retrying without phantom changes', async () => {
    const tasks = useTasks();
    tasks.priorityTasks.value = ['Keep'];
    tasks.markdownContent.value = '# custom pre-mutation markdown';
    saveTodoContent.mockRejectedValueOnce(new Error('offline'));

    await expect(tasks.completeTask('Priority', 0)).rejects.toThrow('offline');
    expect(tasks.priorityTasks.value).toEqual(['Keep']);
    expect(tasks.doneTasks.value).toEqual([]);
    expect(tasks.markdownContent.value).toBe('# custom pre-mutation markdown');
    expect(tasks.dirty.value).toBe(false);

    await tasks.completeTask('Priority', 0);
    expect(tasks.priorityTasks.value).toEqual([]);
    expect(tasks.doneTasks.value).toHaveLength(1);
    expect(saveTodoContent.mock.calls.at(-1)[0].match(/Keep/g)).toHaveLength(1);
  });

  it('keeps Markdown typed while an autosave is pending and saves it against the accepted version', async () => {
    const firstSave = deferred();
    saveTodoContent
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    loadTodoContent.mockResolvedValue({ content: 'Base\n', version: 'v1' });
    const tasks = useTasks();
    await tasks.loadTasks();

    const pending = tasks.saveContent('First edit\n');
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(1));
    tasks.markContentDirty('First edit\nTyped during autosave\n');
    firstSave.resolve({ content: 'First edit\n', version: 'v2' });
    await pending;

    expect(tasks.markdownContent.value).toBe('First edit\nTyped during autosave\n');
    expect(tasks.dirty.value).toBe(true);
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toContain('Typed during autosave');

    await tasks.saveContent(tasks.markdownContent.value);

    expect(saveTodoContent.mock.calls[1]).toEqual([
      'First edit\nTyped during autosave\n',
      'v2',
      {}
    ]);
    expect(tasks.dirty.value).toBe(false);
  });

  it('serializes overlapping task actions and keeps both mutations visible', async () => {
    const firstSave = deferred();
    const secondSave = deferred();
    saveTodoContent
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const initial = generateMarkdownFromTasks(['First', 'Second'], [], []);
    loadTodoContent.mockResolvedValue({ content: initial, version: 'v1' });
    const tasks = useTasks();
    await tasks.loadTasks();

    const firstAction = tasks.completeTask('Priority', 0);
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(1));
    const secondAction = tasks.completeTask('Priority', 0);
    expect(saveTodoContent).toHaveBeenCalledTimes(1);

    firstSave.resolve({ content: saveTodoContent.mock.calls[0][0], version: 'v2' });
    await firstAction;
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(2));
    expect(saveTodoContent.mock.calls[1][1]).toBe('v2');
    secondSave.resolve({ content: saveTodoContent.mock.calls[1][0], version: 'v3' });
    await secondAction;

    expect(tasks.priorityTasks.value).toEqual([]);
    expect(tasks.doneTasks.value).toHaveLength(2);
    expect(tasks.version.value).toBe('v3');
    expect(tasks.dirty.value).toBe(false);
  });

  it('queues backup replacement behind an in-flight Markdown autosave', async () => {
    const firstSave = deferred();
    const base = '# Priority\n\n- [ ] Base\n\n# Other\n\n# Done\n';
    const edited = '# Priority\n\n- [ ] Edited\n\n# Other\n\n# Done\n';
    const backup = '# Priority\n\n- [ ] Backup\n\n# Other\n\n# Done\n';
    loadTodoContent
      .mockResolvedValueOnce({ content: base, version: 'v1' })
      .mockResolvedValueOnce({ content: edited, version: 'v2' });
    saveTodoContent
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementationOnce(async content => ({ content, version: 'v3' }));
    const tasks = useTasks();
    await tasks.loadTasks();

    const autosave = tasks.saveContent(edited);
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(1));
    const restore = tasks.replaceFromBackup(backup, 'v1', vi.fn(async () => true));
    expect(saveTodoContent).toHaveBeenCalledTimes(1);

    firstSave.resolve({ content: edited, version: 'v2' });
    await autosave;
    await restore;

    expect(saveTodoContent.mock.calls[1]).toEqual([
      backup,
      'v2',
      { replacement: true }
    ]);
    expect(tasks.priorityTasks.value).toEqual(['Backup']);
    expect(tasks.version.value).toBe('v3');
    expect(tasks.dirty.value).toBe(false);
  });

  it('restores a local candidate without saving and uses the current restored version later', async () => {
    const restored = '# Priority\n\n- [ ] Backup task\n\n# Other\n\n# Done\n';
    const local = '# Priority\n\n- [ ] Local draft\n\n# Other\n\n# Done\n';
    loadTodoContent.mockResolvedValue({ content: restored, version: 'restored-v2' });
    const tasks = useTasks();
    await tasks.loadTasks();

    tasks.restoreLocalCandidate(local);

    expect(saveTodoContent).not.toHaveBeenCalled();
    expect(tasks.priorityTasks.value).toEqual(['Local draft']);
    expect(tasks.markdownContent.value).toBe(local);
    expect(tasks.dirty.value).toBe(true);
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toContain('Local draft');

    await tasks.saveContent(tasks.markdownContent.value);

    expect(saveTodoContent).toHaveBeenCalledWith(local, 'restored-v2', {});
    expect(tasks.dirty.value).toBe(false);
  });

  it('keeps and saves a local edit queued while backup replacement is in flight', async () => {
    const restoreSave = deferred();
    const base = '# Priority\n\n- [ ] Base\n\n# Other\n\n# Done\n';
    const backup = '# Priority\n\n- [ ] Backup\n\n# Other\n\n# Done\n';
    const local = '# Priority\n\n- [ ] Local edit\n\n# Other\n\n# Done\n';
    loadTodoContent
      .mockResolvedValueOnce({ content: base, version: 'v1' })
      .mockResolvedValueOnce({ content: base, version: 'v1' });
    saveTodoContent
      .mockReturnValueOnce(restoreSave.promise)
      .mockImplementationOnce(async content => ({ content, version: 'v3' }));
    const tasks = useTasks();
    await tasks.loadTasks();

    const restore = tasks.replaceFromBackup(backup, 'v1', vi.fn(async () => true));
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(1));
    const queuedSave = tasks.saveContent(local);
    expect(saveTodoContent).toHaveBeenCalledTimes(1);

    restoreSave.resolve({ content: backup, version: 'v2' });
    await restore;

    expect(tasks.markdownContent.value).toBe(local);
    expect(tasks.priorityTasks.value).toEqual(['Local edit']);
    expect(tasks.dirty.value).toBe(true);
    expect(tasks.version.value).toBe('v2');
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toContain('Local edit');

    await queuedSave;

    expect(saveTodoContent.mock.calls).toEqual([
      [backup, 'v1', { replacement: true }],
      [local, 'v2', {}]
    ]);
    expect(tasks.markdownContent.value).toBe(local);
    expect(tasks.dirty.value).toBe(false);
    expect(tasks.version.value).toBe('v3');
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toBeNull();
  });

  it('queues backup replacement behind an in-flight task action', async () => {
    const taskSave = deferred();
    const initial = generateMarkdownFromTasks(['Complete first'], [], []);
    const backup = generateMarkdownFromTasks(['Backup task'], [], []);
    loadTodoContent
      .mockResolvedValueOnce({ content: initial, version: 'v1' })
      .mockImplementationOnce(async () => ({
        content: saveTodoContent.mock.calls[0][0],
        version: 'v2'
      }));
    saveTodoContent
      .mockReturnValueOnce(taskSave.promise)
      .mockImplementationOnce(async content => ({ content, version: 'v3' }));
    const tasks = useTasks();
    await tasks.loadTasks();

    const action = tasks.completeTask('Priority', 0);
    await vi.waitFor(() => expect(saveTodoContent).toHaveBeenCalledTimes(1));
    const restore = tasks.replaceFromBackup(backup, 'v1', vi.fn(async () => true));
    expect(saveTodoContent).toHaveBeenCalledTimes(1);

    taskSave.resolve({ content: saveTodoContent.mock.calls[0][0], version: 'v2' });
    await action;
    await restore;

    expect(saveTodoContent.mock.calls[1]).toEqual([
      backup,
      'v2',
      { replacement: true }
    ]);
    expect(tasks.priorityTasks.value).toEqual(['Backup task']);
    expect(tasks.doneTasks.value).toEqual([]);
    expect(tasks.version.value).toBe('v3');
  });

  it('replaces through the coordinator after an unresolved conflict', async () => {
    const base = '# Priority\n\n- [ ] Base\n\n# Other\n\n# Done\n';
    const other = '# Priority\n\n- [ ] Other\n\n# Other\n\n# Done\n';
    const backup = '# Priority\n\n- [ ] Backup\n\n# Other\n\n# Done\n';
    loadTodoContent
      .mockResolvedValueOnce({ content: base, version: 'v1' })
      .mockResolvedValueOnce({ content: other, version: 'v2' });
    saveTodoContent
      .mockRejectedValueOnce(new ConflictError('stale', { content: other, version: 'v2' }))
      .mockImplementationOnce(async content => ({ content, version: 'v3' }));
    const tasks = useTasks();
    await tasks.loadTasks();
    tasks.priorityTasks.value = ['Current'];
    await tasks.saveTasks();
    expect(tasks.unresolved.value).toBe(true);
    expect(useConflictDialogQueue().activeConflict.value).not.toBeNull();

    await tasks.replaceFromBackup(backup, 'v1', vi.fn(async () => true));

    expect(saveTodoContent.mock.calls[1]).toEqual([
      backup,
      'v2',
      { replacement: true }
    ]);
    expect(tasks.priorityTasks.value).toEqual(['Backup']);
    expect(tasks.unresolved.value).toBe(false);
    expect(tasks.resolving.value).toBe(false);
    expect(useConflictDialogQueue().activeConflict.value).toBeNull();
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toBeNull();
  });
});
