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

function activeTabText(wrapper) {
  return wrapper.find('.tabs button.active').text();
}

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
