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
