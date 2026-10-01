import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/api/todoApi.js', () => ({
  loadTodoContent: vi.fn(() => Promise.resolve('# Priority\n\n# Other\n\n# Done\n')),
  saveTodoContent: vi.fn(() => Promise.resolve()),
  setupFileWatcher: vi.fn(() => ({ close: vi.fn() }))
}));

vi.mock('../../src/api/linksApi.js', () => ({
  loadLinks: vi.fn(() => Promise.resolve([])),
  saveLinks: vi.fn(() => Promise.resolve())
}));

vi.mock('../../src/api/backupsApi.js', () => ({
  loadBackups: vi.fn(() => Promise.resolve([
    { filename: 'todo-backup-20260728T120000.md', timestamp: new Date(2026, 6, 28, 12, 0, 0).toISOString() }
  ])),
  loadBackupContent: vi.fn(() => Promise.resolve('# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n'))
}));

import App from '../../src/App.vue';
import { saveTodoContent, loadTodoContent } from '../../src/api/todoApi.js';
import { AUTO_SAVE_DELAY_MS } from '../../src/constants.js';

describe('App formatting shortcuts', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] Buy milk today\n\n# Other\n\n# Done\n');
    Element.prototype.scrollIntoView = vi.fn();
  });

  it.each([
    ['metaKey', 'b', '**', 'strong'],
    ['metaKey', 'i', '_', 'em'],
    ['ctrlKey', 'b', '**', 'strong'],
    ['ctrlKey', 'i', '_', 'em']
  ])('saves and renders an edited task with %s + %s', async (modifier, key, marker, tag) => {
    const wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('li.task-item').trigger('click', { [modifier]: true });
      const textarea = wrapper.find('.add-task textarea');
      textarea.element.setSelectionRange(4, 8);
      await textarea.trigger('keydown', { key, [modifier]: true });
      expect(textarea.element.value).toBe(`Buy ${marker}milk${marker} today`);

      await textarea.trigger('keydown', { key: 'Enter', [modifier]: true });
      await flushPromises();
      expect(saveTodoContent).toHaveBeenLastCalledWith(
        expect.stringContaining(`- [ ] Buy ${marker}milk${marker} today`)
      );
      expect(wrapper.find(`.task-text ${tag}`).text()).toBe('milk');
    } finally {
      wrapper.unmount();
    }
  });

  it('formats a new task without submitting it until requested', async () => {
    const wrapper = mount(App);
    try {
      await flushPromises();
      const textarea = wrapper.find('.add-task textarea');
      await textarea.setValue('New task');
      textarea.element.setSelectionRange(0, 3);
      await textarea.trigger('keydown', { key: 'b', ctrlKey: true });
      expect(saveTodoContent).not.toHaveBeenCalled();
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('**New** task'));
    } finally {
      wrapper.unmount();
    }
  });

  it('preserves styled HTML when editing and saving a task', async () => {
    const task = 'I want <span style="color:green">this text</span> to be colored.';
    loadTodoContent.mockResolvedValue(`# Priority\n\n- [ ] ${task}\n\n# Other\n\n# Done\n`);
    const wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const textarea = wrapper.find('.add-task textarea');
      expect(textarea.element.value).toBe(task);

      await textarea.trigger('keydown', { key: 'Enter', metaKey: true });
      await flushPromises();
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining(`- [ ] ${task}`));
      expect(wrapper.find('.task-text span').element.style.color).toBe('green');
    } finally {
      wrapper.unmount();
    }
  });

  it('autosaves formatting applied in the Markdown editor', async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find(button => button.text() === 'Markdown').trigger('click');
      const textarea = wrapper.find('[aria-label="Markdown editor"]');
      const start = textarea.element.value.indexOf('milk');
      textarea.element.setSelectionRange(start, start + 4);
      await textarea.trigger('keydown', { key: 'i', metaKey: true });
      expect(textarea.element.value).toContain('Buy _milk_ today');
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('Buy _milk_ today'));
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });
});

function activeTabText(wrapper) {
  return wrapper.find('.tabs button.active').text();
}

describe('App undo and redo', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n');
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('starts fresh history when switching directly between entries', async () => {
    vi.useFakeTimers();
    loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] First task\n- [ ] Second task\n\n# Other\n\n# Done\n');
    const wrapper = mount(App);
    try {
      await vi.runAllTimersAsync();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const textarea = wrapper.find('.add-task textarea');
      await textarea.setValue('First task changed');
      const second = wrapper.findAll('li.task-item').find(item => item.text() === 'Second task');
      await second.trigger('click', { metaKey: true });
      await vi.runAllTimersAsync();
      expect(textarea.element.value).toBe('Second task');
      await textarea.trigger('keydown', { key: 'z', ctrlKey: true });
      expect(textarea.element.value).toBe('Second task');
      await textarea.setValue('Second task changed');
      await textarea.trigger('keydown', { key: 'z', ctrlKey: true });
      expect(textarea.element.value).toBe('Second task');
      await textarea.trigger('keydown', { key: 'y', ctrlKey: true });
      expect(textarea.element.value).toBe('Second task changed');
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('undoes and redoes edits back to the original task and resets after saving', async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    try {
      await vi.runAllTimersAsync();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const textarea = wrapper.find('.add-task textarea');
      await textarea.setValue('Changed task');
      textarea.element.setSelectionRange(0, 7);
      await textarea.trigger('keydown', { key: 'b', metaKey: true });
      await textarea.trigger('keydown', { key: 'z', metaKey: true });
      expect(textarea.element.value).toBe('Changed task');
      await textarea.trigger('keydown', { key: 'z', metaKey: true });
      expect(textarea.element.value).toBe('Original task');
      await textarea.trigger('keydown', { key: 'z', metaKey: true, shiftKey: true });
      await textarea.trigger('keydown', { key: 'z', metaKey: true, shiftKey: true });
      expect(textarea.element.value).toBe('**Changed** task');
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await vi.runAllTimersAsync();
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('**Changed** task'));
      await textarea.trigger('keydown', { key: 'z', metaKey: true });
      expect(textarea.element.value).toBe('');
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      await textarea.trigger('keydown', { key: 'z', metaKey: true });
      expect(textarea.element.value).toBe('**Changed** task');
      await textarea.setValue('Discarded edit');
      await textarea.trigger('keydown', { key: 'Escape' });
      await vi.runAllTimersAsync();
      await textarea.trigger('keydown', { key: 'z', metaKey: true });
      expect(textarea.element.value).toBe('');
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps Markdown history across autosaves and saves undo and redo results', async () => {
    vi.useFakeTimers();
    let content = '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n';
    loadTodoContent.mockImplementation(async () => content);
    saveTodoContent.mockImplementation(async value => { content = value; });
    const wrapper = mount(App);
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find(button => button.text() === 'Markdown').trigger('click');
      const textarea = wrapper.find('[aria-label="Markdown editor"]');
      const original = textarea.element.value;
      await textarea.setValue(original.replace('Original', 'Changed'));
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
      expect(content).toContain('Changed task');
      await textarea.trigger('keydown', { key: 'z', ctrlKey: true });
      expect(textarea.element.value).toBe(original);
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
      expect(content).toBe(original);
      await textarea.trigger('keydown', { key: 'y', ctrlKey: true });
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
      expect(content).toContain('Changed task');
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
      saveTodoContent.mockImplementation(() => Promise.resolve());
      loadTodoContent.mockResolvedValue('# Priority\n\n# Other\n\n# Done\n');
    }
  });
});

describe('App URL paste', () => {
  const url = 'https://www.bbc.co.uk/news';
  const linkedText = `[this website](${url})`;

  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] See this website\n\n# Other\n\n# Done\n');
    Element.prototype.scrollIntoView = vi.fn();
  });

  it.each([false, true])('saves a pasted link in task text (editing: %s)', async editing => {
    let wrapper = mount(App);
    try {
      await flushPromises();
      if (editing) await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const textarea = wrapper.find('.add-task textarea');
      if (!editing) await textarea.setValue('See this website');
      textarea.element.setSelectionRange(4, 16);
      await textarea.trigger('paste', { clipboardData: { getData: () => url } });
      expect(textarea.element.value).toBe(`See ${linkedText}`);
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();
      const saved = saveTodoContent.mock.calls.at(-1)[0];
      expect(saved).toContain(`- [ ] See ${linkedText}`);
      wrapper.unmount();
      loadTodoContent.mockResolvedValue(saved);
      wrapper = mount(App);
      await flushPromises();
      const link = wrapper.find('.task-text a');
      expect(link.attributes('href')).toBe(url);
      expect(link.text()).toBe('this website');
    } finally {
      wrapper.unmount();
    }
  });

  it('autosaves a pasted link in the Markdown editor', async () => {
    vi.useFakeTimers();
    const wrapper = mount(App);
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find(button => button.text() === 'Markdown').trigger('click');
      const textarea = wrapper.find('[aria-label="Markdown editor"]');
      const start = textarea.element.value.indexOf('this website');
      textarea.element.setSelectionRange(start, start + 12);
      await textarea.trigger('paste', { clipboardData: { getData: () => url } });
      expect(textarea.element.value).toContain(linkedText);
      await vi.advanceTimersByTimeAsync(AUTO_SAVE_DELAY_MS);
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining(linkedText));
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('does not cancel normal replacement pastes', async () => {
    const wrapper = mount(App);
    try {
      await flushPromises();
      const textarea = wrapper.find('.add-task textarea');
      await textarea.setValue('See this website');
      textarea.element.setSelectionRange(4, 16);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', { value: { getData: () => 'replacement' } });
      textarea.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      // jsdom has no native paste default action, so simulate the browser edit.
      textarea.element.setRangeText('replacement', 4, 16, 'end');
      await textarea.trigger('input');
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('- [ ] See replacement'));
    } finally {
      wrapper.unmount();
    }
  });
});

describe('App block Markdown editing', () => {
  it('saves, reloads, and reopens a task without flattening nested lists or paragraphs', async () => {
    window.location.hash = '';
    loadTodoContent.mockResolvedValue('# Priority\n\n# Other\n\n# Done\n');
    const task = 'This should be a bullet list:\n- Point one\n- Point two\n  - Bullet list within a list point\n  - Another sub bullet point\n- Point three\n\nAnother paragraph.';
    let wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('.add-task textarea').setValue(task);
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();
      const saved = saveTodoContent.mock.calls.at(-1)[0];
      expect(saved).toContain('    - Bullet list within a list point');
      wrapper.unmount();

      loadTodoContent.mockResolvedValue(saved);
      wrapper = mount(App);
      await flushPromises();
      expect(wrapper.findAll('.task-text > ul > li')).toHaveLength(3);
      expect(wrapper.findAll('.task-text ul ul li')).toHaveLength(2);
      expect(wrapper.findAll('.task-text > p')).toHaveLength(2);
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      expect(wrapper.find('.add-task textarea').element.value).toBe(task);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('App tab hash routing', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('shows the Tasks tab by default when there is no hash', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(activeTabText(wrapper)).toBe('Tasks');
    wrapper.unmount();
  });

  it('shows the tab matching the initial hash', async () => {
    window.location.hash = '#links';
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(activeTabText(wrapper)).toBe('Links');
    wrapper.unmount();
  });

  it('maps #markdown to the Markdown tab', async () => {
    window.location.hash = '#markdown';
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    expect(activeTabText(wrapper)).toBe('Markdown');
    wrapper.unmount();
  });

  it('updates the hash when a tab is clicked', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const notesBtn = wrapper.findAll('.tabs button').find((b) => b.text() === 'About');
    await notesBtn.trigger('click');
    expect(window.location.hash).toBe('#notes');
    wrapper.unmount();
  });
});

describe('App Esc cancels in the task text box', () => {
  beforeEach(() => {
    window.location.hash = '';
    loadTodoContent.mockReset();
    loadTodoContent.mockResolvedValue('# Priority\n\n# Other\n\n# Done\n');
    // jsdom does not implement scrollIntoView, which the cancel/restore path calls.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('clears a new task when Esc is pressed in the text box', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const textarea = wrapper.find('.add-task textarea');
    await textarea.setValue('a half-typed task');
    expect(textarea.element.value).toBe('a half-typed task');

    await textarea.trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(wrapper.find('.add-task textarea').element.value).toBe('');
  });

  it('restores the original task and clears the box when Esc is pressed while editing', async () => {
    vi.useFakeTimers();
    try {
      loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] Buy milk\n\n# Other\n\n# Done\n');
      const wrapper = mount(App, { attachTo: document.body });
      await vi.runAllTimersAsync();

      // Enter edit mode via the double-click context menu: the task moves into the box.
      await wrapper.find('li.task-item').trigger('dblclick');
      await wrapper.find('.context-menu-item').trigger('click');
      await vi.runAllTimersAsync();
      const textarea = wrapper.find('.add-task textarea');
      expect(textarea.element.value).toBe('Buy milk');
      expect(wrapper.find('.add-task button').text()).toBe('Save');

      // Esc behaves exactly like Cancel: the task is restored and the box cleared.
      await textarea.trigger('keydown', { key: 'Escape' });
      await vi.runAllTimersAsync();

      expect(wrapper.find('.add-task textarea').element.value).toBe('');
      expect(wrapper.find('.add-task button').text()).toBe('Add');
      expect(wrapper.text()).toContain('Buy milk');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App backups preview', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('has a Backups tab immediately to the right of About', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const labels = wrapper.findAll('.tabs button').map((b) => b.text());
    expect(labels).toContain('Backups');
    expect(labels.indexOf('Backups')).toBe(labels.indexOf('About') + 1);
    wrapper.unmount();
  });

  it('previews a backup read-only in the Tasks tab, then restores it', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    // Open Backups tab and click the backup
    const backupsBtn = wrapper.findAll('.tabs button').find((b) => b.text() === 'Backups');
    await backupsBtn.trigger('click');
    await flushPromises();
    await wrapper.find('.backup-item').trigger('click');
    await flushPromises();

    // We should be on the Tasks tab, showing the read-only preview banner
    expect(activeTabText(wrapper)).toBe('Tasks');
    expect(wrapper.find('.backup-banner').exists()).toBe(true);
    // No add-task textarea while previewing
    expect(wrapper.find('.add-task').exists()).toBe(false);
    expect(wrapper.text()).toContain('Backed-up task');

    // Use this backup -> saves the backup content and dismisses the banner
    saveTodoContent.mockClear();
    await wrapper.find('.backup-banner .btn-primary').trigger('click');
    await flushPromises();
    expect(saveTodoContent).toHaveBeenCalledWith(
      '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n'
    );
    expect(wrapper.find('.backup-banner').exists()).toBe(false);
    expect(wrapper.find('.add-task').exists()).toBe(true);
    wrapper.unmount();
  });

  it('cancel dismisses the preview without saving', async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const backupsBtn = wrapper.findAll('.tabs button').find((b) => b.text() === 'Backups');
    await backupsBtn.trigger('click');
    await flushPromises();
    await wrapper.find('.backup-item').trigger('click');
    await flushPromises();

    saveTodoContent.mockClear();
    await wrapper.find('.backup-banner .btn-secondary').trigger('click');
    await flushPromises();
    expect(saveTodoContent).not.toHaveBeenCalled();
    expect(wrapper.find('.backup-banner').exists()).toBe(false);
    // Cancelling returns the user to the Backups tab.
    const activeTab = wrapper.find('.tabs button.active');
    expect(activeTab.text()).toBe('Backups');
    wrapper.unmount();
  });
});

describe('App command-click to edit', () => {
  beforeEach(() => {
    window.location.hash = '';
    loadTodoContent.mockReset();
  });

  it('loads a command-clicked task into the edit text box', async () => {
    loadTodoContent.mockResolvedValue('# Priority\n\n- [ ] Buy milk\n\n# Other\n\n# Done\n');
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    // The task is rendered in the Priority list.
    const item = wrapper.find('li.task-item');
    expect(item.text()).toContain('Buy milk');

    // Command-click (metaKey) should move the task into the edit text box.
    await item.trigger('click', { metaKey: true });
    await flushPromises();

    const textarea = wrapper.find('.add-task textarea');
    expect(textarea.element.value).toBe('Buy milk');
    expect(textarea.attributes('aria-label')).toBe('Edit task');
    // The submit button switches to "Save" while editing.
    expect(wrapper.find('.add-task button').text()).toBe('Save');
    wrapper.unmount();
  });
});
