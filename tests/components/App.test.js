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

import App from '../../src/App.vue';
import { loadTodoContent } from '../../src/api/todoApi.js';

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
    const notesBtn = wrapper.findAll('.tabs button').find((b) => b.text() === 'Notes');
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
