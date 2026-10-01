import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/api/todoApi.js', () => ({
  loadTodoContent: vi.fn(() => Promise.resolve({ content: '# Priority\n\n# Other\n\n# Done\n', version: 'v1' })),
  saveTodoContent: vi.fn((content) => Promise.resolve({ content, version: `v-${content.length}` })),
  setupFileWatcher: vi.fn(() => ({ close: vi.fn() }))
}));

vi.mock('../../src/api/linksApi.js', () => ({
  loadLinks: vi.fn(() => Promise.resolve({ categories: [], rawContent: '[]', version: 'l1', invalid: false })),
  saveLinks: vi.fn((categories) => Promise.resolve({ categories, rawContent: JSON.stringify(categories), version: 'l2', invalid: false }))
}));

vi.mock('../../src/api/backupsApi.js', () => ({
  loadBackups: vi.fn(() => Promise.resolve([
    { filename: 'todo-backup-20260728T120000.md', timestamp: new Date(2026, 6, 28, 12, 0, 0).toISOString() }
  ])),
  loadBackupContent: vi.fn(() => Promise.resolve('# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n'))
}));

import App from '../../src/App.vue';
import { saveTodoContent, loadTodoContent, setupFileWatcher } from '../../src/api/todoApi.js';
import { AUTO_SAVE_DELAY_MS } from '../../src/constants.js';

beforeEach(() => {
  sessionStorage.clear();
  saveTodoContent.mockImplementation(async (content) => ({
    content,
    version: `v-${content.length}`
  }));
});

describe('App formatting shortcuts', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    sessionStorage.clear();
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] Buy milk today\n\n# Other\n\n# Done\n', version: 'v1' });
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
        expect.stringContaining(`- [ ] Buy ${marker}milk${marker} today`),
        expect.any(String),
        expect.any(Object)
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
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('**New** task'), expect.any(String), expect.any(Object));
    } finally {
      wrapper.unmount();
    }
  });

  it('preserves styled HTML when editing and saving a task', async () => {
    const task = 'I want <span style="color:green">this text</span> to be colored.';
    loadTodoContent.mockResolvedValue({ content: `# Priority\n\n- [ ] ${task}\n\n# Other\n\n# Done\n`, version: 'v1' });
    const wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const textarea = wrapper.find('.add-task textarea');
      expect(textarea.element.value).toBe(task);

      await textarea.trigger('keydown', { key: 'Enter', metaKey: true });
      await flushPromises();
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining(`- [ ] ${task}`), expect.any(String), expect.any(Object));
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
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('Buy _milk_ today'), expect.any(String), expect.any(Object));
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
    sessionStorage.clear();
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n', version: 'v1' });
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('starts fresh history when switching directly between entries', async () => {
    vi.useFakeTimers();
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] First task\n- [ ] Second task\n\n# Other\n\n# Done\n', version: 'v1' });
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
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('**Changed** task'), expect.any(String), expect.any(Object));
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
    loadTodoContent.mockImplementation(async () => ({ content, version: `v-${content.length}` }));
    saveTodoContent.mockImplementation(async value => {
      content = value;
      return { content, version: `v-${content.length}` };
    });
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
      saveTodoContent.mockImplementation(async (content) => ({ content, version: `v-${content.length}` }));
      loadTodoContent.mockResolvedValue({ content: '# Priority\n\n# Other\n\n# Done\n', version: 'v1' });
    }
  });
});

describe('App URL paste', () => {
  const url = 'https://www.bbc.co.uk/news';
  const linkedText = `[this website](${url})`;

  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    sessionStorage.clear();
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] See this website\n\n# Other\n\n# Done\n', version: 'v1' });
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
      loadTodoContent.mockResolvedValue({ content: saved, version: 'v2' });
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
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining(linkedText), expect.any(String), expect.any(Object));
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
      expect(saveTodoContent).toHaveBeenLastCalledWith(expect.stringContaining('- [ ] See replacement'), expect.any(String), expect.any(Object));
    } finally {
      wrapper.unmount();
    }
  });
});

describe('App block Markdown editing', () => {
  it('saves, reloads, and reopens a task without flattening nested lists or paragraphs', async () => {
    window.location.hash = '';
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n# Other\n\n# Done\n', version: 'v1' });
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

      loadTodoContent.mockResolvedValue({ content: saved, version: 'v2' });
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
    sessionStorage.clear();
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n# Other\n\n# Done\n', version: 'v1' });
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
      loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] Buy milk\n\n# Other\n\n# Done\n', version: 'v1' });
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
      '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n',
      expect.any(String),
      { replacement: true }
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

  it('warns instead of merging when live content changed after backup preview', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    loadTodoContent
      .mockResolvedValueOnce({ content: '# Priority\n\n# Other\n\n# Done\n', version: 'v1' })
      .mockResolvedValueOnce({ content: '# Priority\n\n- [ ] Newer\n\n# Other\n\n# Done\n', version: 'v2' });
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
    await flushPromises();
    await wrapper.find('.backup-item').trigger('click');
    await flushPromises();
    saveTodoContent.mockClear();
    await wrapper.find('.backup-banner .btn-primary').trigger('click');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalled();
    expect(saveTodoContent).not.toHaveBeenCalled();
    expect(wrapper.find('.backup-banner').exists()).toBe(true);
    wrapper.unmount();
    confirmSpy.mockRestore();
  });

  it('keeps a task edit unchanged when preview is canceled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    loadTodoContent.mockResolvedValue({
      content: '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n',
      version: 'v1'
    });
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    await wrapper.find('li.task-item').trigger('click', { metaKey: true });
    await wrapper.find('.add-task textarea').setValue('Unsaved task edit');
    await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
    await flushPromises();

    await wrapper.find('.backup-item').trigger('click');
    await flushPromises();
    expect(activeTabText(wrapper)).toBe('Backups');

    await wrapper.find('.backup-item').trigger('click');
    await flushPromises();
    expect(activeTabText(wrapper)).toBe('Tasks');
    await wrapper.find('.backup-banner .btn-secondary').trigger('click');
    await wrapper.findAll('.tabs button').find((button) => button.text() === 'Tasks').trigger('click');

    const input = wrapper.find('.add-task textarea');
    expect(input.element.value).toBe('Unsaved task edit');
    expect(input.attributes('aria-label')).toBe('Edit task');
    expect(saveTodoContent).not.toHaveBeenCalled();
    expect(confirmSpy).toHaveBeenCalled();
    wrapper.unmount();
    confirmSpy.mockRestore();
  });

  it('keeps a dirty Markdown draft unchanged when preview is canceled', async () => {
    vi.useFakeTimers();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Markdown').trigger('click');
      const editor = wrapper.find('[aria-label="Markdown editor"]');
      const draft = `${editor.element.value}\nUnsaved Markdown draft`;
      await editor.setValue(draft);
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-banner .btn-secondary').trigger('click');
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Markdown').trigger('click');

      expect(wrapper.find('[aria-label="Markdown editor"]').element.value).toBe(draft);
      expect(saveTodoContent).not.toHaveBeenCalled();
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toContain('Unsaved Markdown draft');
    } finally {
      wrapper.unmount();
      confirmSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('continues backup preview with an actionable warning when recovery storage is full', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('.add-task textarea').setValue('Unsaved task');
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();

      expect(wrapper.find('.backup-banner').exists()).toBe(true);
      expect(wrapper.find('.error').text()).toContain('Keep this tab open');
      expect(saveTodoContent).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      storageSpy.mockRestore();
      consoleSpy.mockRestore();
      confirmSpy.mockRestore();
    }
  });

  it('does not restore a backup when unsaved work cannot be persisted for recovery', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(App);
    try {
      await flushPromises();
      await wrapper.find('.add-task textarea').setValue('Unsaved task');
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();
      saveTodoContent.mockClear();

      await wrapper.find('.backup-banner .btn-primary').trigger('click');
      await flushPromises();

      expect(saveTodoContent).not.toHaveBeenCalled();
      expect(wrapper.find('.backup-banner').exists()).toBe(true);
      expect(wrapper.find('.error').text()).toContain('backup was not restored');
    } finally {
      wrapper.unmount();
      storageSpy.mockRestore();
      consoleSpy.mockRestore();
      confirmSpy.mockRestore();
    }
  });

  it('requires an explicit decision before restoring over dirty Markdown', async () => {
    vi.useFakeTimers();
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Markdown').trigger('click');
      const editor = wrapper.find('[aria-label="Markdown editor"]');
      await editor.setValue(`${editor.element.value}\nKeep this local draft`);
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();

      saveTodoContent.mockClear();
      await wrapper.find('.backup-banner .btn-primary').trigger('click');
      await flushPromises();
      expect(saveTodoContent).not.toHaveBeenCalled();
      expect(wrapper.find('.backup-banner').exists()).toBe(true);
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toContain('Keep this local draft');

      await wrapper.find('.backup-banner .btn-primary').trigger('click');
      await flushPromises();
      expect(saveTodoContent).toHaveBeenCalledWith(
        '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n',
        'v1',
        { replacement: true }
      );
      expect(wrapper.find('.backup-banner').exists()).toBe(false);
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toContain('Keep this local draft');
    } finally {
      wrapper.unmount();
      confirmSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('preserves a task edit in session storage before an approved restore', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    loadTodoContent.mockResolvedValue({
      content: '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n',
      version: 'v1'
    });
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      await wrapper.find('.add-task textarea').setValue('Recoverable task edit');
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-banner .btn-primary').trigger('click');
      await flushPromises();

      const stored = JSON.parse(sessionStorage.getItem('todo-page-backup-restore-draft:todo'));
      expect(stored.taskInput).toBe('Recoverable task edit');
      expect(stored.editState).toMatchObject({
        isEditing: true,
        originalList: 'Priority',
        originalIndex: 0
      });
      expect(wrapper.find('.backup-banner').exists()).toBe(false);
      expect(wrapper.find('.add-task textarea').element.value).toBe('');
    } finally {
      wrapper.unmount();
      confirmSpy.mockRestore();
    }
  });

  it('surfaces a saved draft after restore and remount, then recovers it without overwriting the backup', async () => {
    vi.useFakeTimers();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let persisted = '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n';
    let persistedVersion = 'v1';
    loadTodoContent.mockImplementation(async () => ({
      content: persisted,
      version: persistedVersion
    }));
    saveTodoContent.mockImplementation(async (content, expectedVersion, options) => {
      expect(expectedVersion).toBe(persistedVersion);
      persisted = content;
      persistedVersion = options.replacement ? 'restored-v2' : 'saved-v3';
      return { content, version: persistedVersion };
    });

    let wrapper = mount(App, { attachTo: document.body });
    try {
      await vi.runAllTimersAsync();
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Markdown').trigger('click');
      const editor = wrapper.find('[aria-label="Markdown editor"]');
      const localDraft = editor.element.value.replace('Original task', 'Recovered local task');
      await editor.setValue(localDraft);
      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Backups').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-item').trigger('click');
      await flushPromises();
      await wrapper.find('.backup-banner .btn-primary').trigger('click');
      await flushPromises();

      expect(persisted).toContain('Backed-up task');
      expect(wrapper.find('[aria-label="Restore unsaved changes"]').exists()).toBe(true);
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toContain('Recovered local task');

      wrapper.unmount();
      wrapper = mount(App, { attachTo: document.body });
      await flushPromises();

      expect(wrapper.find('[aria-label="Restore unsaved changes"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('Backed-up task');
      const callsBeforeRecovery = saveTodoContent.mock.calls.length;
      await wrapper.find('[aria-label="Restore unsaved changes"]').trigger('click');
      await flushPromises();

      expect(saveTodoContent).toHaveBeenCalledTimes(callsBeforeRecovery);
      expect(activeTabText(wrapper)).toBe('Markdown');
      expect(wrapper.find('[aria-label="Markdown editor"]').element.value).toBe(localDraft);
      expect(wrapper.text()).toContain('Recovered local task');
      expect(wrapper.text()).not.toContain('Backed-up task');
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toBeNull();
      expect(sessionStorage.getItem('todo-page-conflict:todo')).toContain('Recovered local task');

      await wrapper.findAll('.tabs button').find((button) => button.text() === 'Tasks').trigger('click');
      await wrapper.find('input[type="checkbox"]').setValue(true);
      await flushPromises();

      expect(saveTodoContent.mock.calls.at(-1)[1]).toBe('restored-v2');
      expect(saveTodoContent.mock.calls.at(-1)[2]).toEqual({});
      expect(persisted).toContain('Recovered local task');
      expect(persistedVersion).toBe('saved-v3');
    } finally {
      wrapper.unmount();
      confirmSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('restores saved task edit context when the original task is still present', async () => {
    const restored = '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n';
    const local = '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n';
    loadTodoContent.mockResolvedValue({ content: restored, version: 'restored-v2' });
    sessionStorage.setItem('todo-page-backup-restore-draft:todo', JSON.stringify({
      content: local,
      taskInput: 'Recoverable task edit',
      editState: {
        isEditing: true,
        originalList: 'Priority',
        originalIndex: 0,
        originalText: 'Original task'
      },
      preferredTab: 'tasks'
    }));
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      await wrapper.find('[aria-label="Restore unsaved changes"]').trigger('click');
      await flushPromises();

      const input = wrapper.find('.add-task textarea');
      expect(input.element.value).toBe('Recoverable task edit');
      expect(input.attributes('aria-label')).toBe('Edit task');
      expect(wrapper.find('.add-task .btn-primary').text()).toBe('Save');
      expect(wrapper.text()).toContain('Original task');
      expect(saveTodoContent).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('restores a saved new-task draft without submitting it', async () => {
    const restored = '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n';
    const local = '# Priority\n\n- [ ] Original task\n\n# Other\n\n# Done\n';
    loadTodoContent.mockResolvedValue({ content: restored, version: 'restored-v2' });
    sessionStorage.setItem('todo-page-backup-restore-draft:todo', JSON.stringify({
      content: local,
      taskInput: 'Half-written new task',
      editState: { isEditing: false },
      preferredTab: 'tasks'
    }));
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      await wrapper.find('[aria-label="Restore unsaved changes"]').trigger('click');
      await flushPromises();

      const input = wrapper.find('.add-task textarea');
      expect(input.element.value).toBe('Half-written new task');
      expect(input.attributes('aria-label')).toBe('New task');
      expect(wrapper.find('.add-task .btn-primary').text()).toBe('Add');
      expect(wrapper.text()).toContain('Original task');
      expect(saveTodoContent).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('discards a saved restore draft only when explicitly requested', async () => {
    const restored = '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n';
    loadTodoContent.mockResolvedValue({ content: restored, version: 'restored-v2' });
    sessionStorage.setItem('todo-page-backup-restore-draft:todo', JSON.stringify({
      content: '# Priority\n\n- [ ] Discard me\n\n# Other\n\n# Done\n',
      taskInput: '',
      editState: { isEditing: false },
      preferredTab: 'editor'
    }));
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).not.toBeNull();
      expect(wrapper.find('[aria-label="Discard saved draft"]').exists()).toBe(true);

      await wrapper.find('[aria-label="Discard saved draft"]').trigger('click');

      expect(sessionStorage.getItem('todo-page-backup-restore-draft:todo')).toBeNull();
      expect(wrapper.find('.recovery-banner').exists()).toBe(false);
      expect(wrapper.text()).toContain('Backed-up task');
      expect(wrapper.text()).not.toContain('Discard me');
      expect(saveTodoContent).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });

  it('does not offer recovery when the stored draft is not actually available', async () => {
    const restored = '# Priority\n\n- [ ] Backed-up task\n\n# Other\n\n# Done\n';
    loadTodoContent.mockResolvedValue({ content: restored, version: 'restored-v2' });
    sessionStorage.setItem('todo-page-backup-restore-draft:todo', '{"capturedAt":"invalid-without-content"}');
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      expect(wrapper.find('.recovery-banner').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
});

describe('App command-click to edit', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.clearAllMocks();
    loadTodoContent.mockReset();
  });

  it('loads a command-clicked task into the edit text box', async () => {
    loadTodoContent.mockResolvedValue({ content: '# Priority\n\n- [ ] Buy milk\n\n# Other\n\n# Done\n', version: 'v1' });
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
    expect(saveTodoContent).not.toHaveBeenCalled();
    await wrapper.find('.add-task .btn-secondary').trigger('click');
    expect(saveTodoContent).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('preserves an edited entry and shows an actionable error for a legacy save response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    loadTodoContent.mockResolvedValue({
      content: '# Priority\n\n- [ ] Buy milk\n\n# Other\n\n# Done\n',
      version: 'v1'
    });
    saveTodoContent.mockResolvedValue({ success: true });
    const wrapper = mount(App, { attachTo: document.body });
    try {
      await flushPromises();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const input = wrapper.find('.add-task textarea');
      await input.setValue('Buy oat milk');
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();

      expect(saveTodoContent).toHaveBeenCalledWith(
        expect.stringContaining('- [ ] Buy oat milk'),
        'v1',
        {}
      );
      expect(input.element.value).toBe('Buy oat milk');
      expect(input.attributes('aria-label')).toBe('Edit task');
      expect(wrapper.find('.task-text').text()).toBe('Buy milk');
      const message = wrapper.find('.error').text();
      expect(message).toContain('Restart the app server');
      expect(message).toContain('Your edits are still here');
      expect(message).not.toContain('split');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving todo:',
        expect.objectContaining({
          message: expect.stringContaining('snapshot=undefined')
        })
      );
    } finally {
      wrapper.unmount();
      consoleSpy.mockRestore();
    }
  });
});

describe('App resource watcher', () => {
  it('reloads clean Markdown without echoing the programmatic update as an autosave', async () => {
    vi.useFakeTimers();
    try {
      loadTodoContent
        .mockResolvedValueOnce({ content: '# Priority\n\n- [ ] Original\n\n# Other\n\n# Done\n', version: 'v1' })
        .mockResolvedValueOnce({ content: '# Priority\n\n- [ ] External\n\n# Other\n\n# Done\n', version: 'v2' });
      const wrapper = mount(App);
      await vi.runAllTimersAsync();
      saveTodoContent.mockClear();
      const callback = setupFileWatcher.mock.calls.at(-1)[0];
      callback({ resource: 'todo', version: 'v2' });
      await vi.runAllTimersAsync();
      expect(wrapper.find('.task-text').text()).toContain('External');
      expect(saveTodoContent).not.toHaveBeenCalled();
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves an active task edit and does not autosave an external change when switching to Markdown', async () => {
    vi.useFakeTimers();
    try {
      loadTodoContent.mockResolvedValue({
        content: '# Priority\n\n- [ ] Original\n\n# Other\n\n# Done\n',
        version: 'v1'
      });
      const wrapper = mount(App);
      await vi.runAllTimersAsync();
      await wrapper.find('li.task-item').trigger('click', { metaKey: true });
      const taskInput = wrapper.find('.add-task textarea');
      await taskInput.setValue('Draft edit');

      const callback = setupFileWatcher.mock.calls.at(-1)[0];
      callback({ resource: 'todo', version: 'v2' });
      await flushPromises();
      saveTodoContent.mockClear();
      loadTodoContent.mockResolvedValue({
        content: '# Priority\n\n- [ ] External\n\n# Other\n\n# Done\n',
        version: 'v2'
      });
      await wrapper.findAll('.tabs button').find(button => button.text() === 'Markdown').trigger('click');
      await vi.runAllTimersAsync();

      expect(saveTodoContent).not.toHaveBeenCalled();
      const markdownEditor = wrapper.find('[aria-label="Markdown editor"]');
      expect(markdownEditor.attributes('readonly')).toBeDefined();
      expect(markdownEditor.element.value).toContain('Original');
      expect(markdownEditor.element.value).not.toContain('External');
      expect(wrapper.text()).toContain('Save or cancel the active task edit');

      await wrapper.findAll('.tabs button').find(button => button.text() === 'Tasks').trigger('click');
      expect(taskInput.element.value).toBe('Draft edit');
      expect(taskInput.attributes('aria-label')).toBe('Edit task');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishes a pending Markdown save before starting a task edit', async () => {
    vi.useFakeTimers();
    try {
      loadTodoContent.mockResolvedValue({
        content: '# Priority\n\n- [ ] First\n- [ ] Second\n\n# Other\n\n# Done\n',
        version: 'v1'
      });
      saveTodoContent.mockImplementation(async (content) => ({
        content,
        version: 'v2'
      }));
      const wrapper = mount(App);
      await vi.runAllTimersAsync();

      await wrapper.findAll('.tabs button').find(button => button.text() === 'Markdown').trigger('click');
      const markdownEditor = wrapper.find('[aria-label="Markdown editor"]');
      await markdownEditor.setValue(
        '# Priority\n\n- [ ] First\n- [ ] Second\n\n# Other\n\n- [ ] Added in Markdown\n\n# Done\n'
      );
      await wrapper.findAll('.tabs button').find(button => button.text() === 'Tasks').trigger('click');

      const secondTask = wrapper.findAll('li.task-item')[1];
      await secondTask.trigger('click', { metaKey: true });
      await flushPromises();
      await vi.runAllTimersAsync();

      const taskInput = wrapper.find('.add-task textarea');
      expect(taskInput.element.value).toBe('Second');
      await taskInput.setValue('Edited second');
      await wrapper.find('.add-task .btn-primary').trigger('click');
      await flushPromises();

      expect(saveTodoContent).toHaveBeenCalledTimes(2);
      expect(saveTodoContent.mock.calls.at(-1)[0]).toContain('- [ ] First\n- [ ] Edited second');
      expect(saveTodoContent.mock.calls.at(-1)[0]).toContain('- [ ] Added in Markdown');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App optimistic failure recovery', () => {
  it('keeps task input after a failed add and retries without duplicates', async () => {
    loadTodoContent.mockResolvedValue({
      content: '# Priority\n\n# Other\n\n# Done\n',
      version: 'v1'
    });
    saveTodoContent
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (content) => ({
        content,
        version: 'v2'
      }));
    const wrapper = mount(App);
    await flushPromises();
    const input = wrapper.find('.add-task textarea');
    await input.setValue('Retry once');

    await wrapper.find('.add-task .btn-primary').trigger('click');
    await flushPromises();
    expect(input.element.value).toBe('Retry once');
    expect(wrapper.findAll('.task-text')).toHaveLength(0);

    await wrapper.find('.add-task .btn-primary').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.task-text')).toHaveLength(1);
    expect(wrapper.find('.task-text').text()).toBe('Retry once');
    expect(saveTodoContent.mock.calls.at(-1)[0].match(/Retry once/g)).toHaveLength(1);
    wrapper.unmount();
  });
});
