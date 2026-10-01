import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/api/linksApi.js', () => ({
  loadLinks: vi.fn(() => Promise.resolve([])),
  saveLinks: vi.fn(() => Promise.resolve())
}));

import { loadLinks, saveLinks } from '../../src/api/linksApi.js';
import LinksTab from '../../src/components/LinksTab.vue';

beforeEach(() => {
  vi.clearAllMocks();
  loadLinks.mockResolvedValue([]);
  saveLinks.mockResolvedValue(undefined);
});

async function fill(wrapper, { category, url, description }) {
  if (category !== undefined) await wrapper.find('#link-category').setValue(category);
  if (url !== undefined) await wrapper.find('#link-url').setValue(url);
  if (description !== undefined) await wrapper.find('#link-description').setValue(description);
}

describe('LinksTab', () => {
  it('supports independent undo and redo in all link fields and resets on cancel and save', async () => {
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      const fields = [
        ['#link-category', 'GitHub', 'News'],
        ['#link-url', '', 'https://example.com'],
        ['#link-description', '', 'Description']
      ];
      for (const [selector, original, changed] of fields) {
        const field = wrapper.find(selector);
        await field.setValue(changed);
        await field.trigger('keydown', { key: 'z', ctrlKey: true });
        expect(field.element.value).toBe(original);
        await field.trigger('keydown', { key: 'y', ctrlKey: true });
        expect(field.element.value).toBe(changed);
      }
      await wrapper.find('.btn-primary').trigger('click');
      await flushPromises();
      expect(saveLinks.mock.calls.at(-1)[0][0].links[0].description).toBe('Description');
      for (const [selector, original] of fields) {
        await wrapper.find(selector).trigger('keydown', { key: 'z', ctrlKey: true });
        expect(wrapper.find(selector).element.value).toBe(original);
      }
      await wrapper.find('.link-description').trigger('dblclick');
      await wrapper.find('.context-menu-item').trigger('click');
      const description = wrapper.find('#link-description');
      await description.trigger('keydown', { key: 'z', ctrlKey: true });
      expect(description.element.value).toBe('Description');
      await description.setValue('Changed');
      await description.trigger('keydown', { key: 'z', ctrlKey: true });
      expect(description.element.value).toBe('Description');
      await wrapper.find('.btn-secondary').trigger('click');
      await description.trigger('keydown', { key: 'y', ctrlKey: true });
      expect(description.element.value).toBe('');
    } finally { wrapper.unmount(); }
  });

  it('undoes category dropdown selection without discarding earlier typing history', async () => {
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      const category = wrapper.find('#link-category');
      await category.setValue('Custom');
      await wrapper.find('.category-toggle').trigger('click');
      await wrapper.find('.category-option').trigger('click');
      expect(category.element.value).toBe('GitHub');
      await category.trigger('keydown', { key: 'z', metaKey: true });
      expect(category.element.value).toBe('Custom');
      await category.trigger('keydown', { key: 'z', metaKey: true });
      expect(category.element.value).toBe('GitHub');
    } finally { wrapper.unmount(); }
  });

  it('saves and renders a URL pasted over selected description text', async () => {
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      await fill(wrapper, { category: 'News', url: 'https://example.com', description: 'See this website' });
      const textarea = wrapper.find('#link-description');
      textarea.element.setSelectionRange(4, 16);
      await textarea.trigger('paste', {
        clipboardData: { getData: () => 'https://www.bbc.co.uk/news' }
      });
      expect(textarea.element.value).toBe('See [this website](https://www.bbc.co.uk/news)');
      await wrapper.find('.btn-primary').trigger('click');
      await flushPromises();
      expect(saveLinks.mock.calls.at(-1)[0][0].links[0].description)
        .toBe('See [this website](https://www.bbc.co.uk/news)');
      expect(wrapper.find('.link-description a').attributes('href')).toBe('https://www.bbc.co.uk/news');
      expect(wrapper.find('.link-description a').text()).toBe('this website');
    } finally {
      wrapper.unmount();
    }
  });

  it.each(['#link-category', '#link-url'])('keeps native URL pasting in %s', async selector => {
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      const input = wrapper.find(selector);
      await input.setValue('example');
      input.element.setSelectionRange(0, 7);
      const event = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => 'https://www.bbc.co.uk/news' }
      });
      input.element.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(input.element.value).toBe('example');
    } finally {
      wrapper.unmount();
    }
  });

  it.each([
    ['metaKey', 'b', '**', 'strong'],
    ['metaKey', 'i', '_', 'em'],
    ['ctrlKey', 'b', '**', 'strong'],
    ['ctrlKey', 'i', '_', 'em']
  ])('saves description formatting with %s + %s', async (modifier, key, marker, tag) => {
    loadLinks.mockResolvedValue([{
      name: 'GitHub',
      links: [{ id: 'existing', url: 'https://github.com', description: 'The repo' }]
    }]);
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      await wrapper.find('.link-description').trigger('dblclick');
      await wrapper.find('.context-menu-item').trigger('click');
      expect(wrapper.find('.btn-primary').text()).toBe('Save');
      const textarea = wrapper.find('#link-description');
      textarea.element.setSelectionRange(4, 8);
      await textarea.trigger('keydown', { key, [modifier]: true });
      expect(textarea.element.value).toBe(`The ${marker}repo${marker}`);
      expect(saveLinks).not.toHaveBeenCalled();
      await textarea.trigger('keydown', { key: 'Enter', [modifier]: true });
      await flushPromises();
      expect(saveLinks.mock.calls.at(-1)[0][0].links[0].description).toBe(`The ${marker}repo${marker}`);
      expect(wrapper.find(`.link-description ${tag}`).text()).toBe('repo');
    } finally {
      wrapper.unmount();
    }
  });

  it.each(['#link-category', '#link-url'])('does not format %s', async selector => {
    const wrapper = mount(LinksTab);
    try {
      await flushPromises();
      const input = wrapper.find(selector);
      await input.setValue('example');
      input.element.setSelectionRange(0, 7);
      await input.trigger('keydown', { key: 'b', ctrlKey: true });
      expect(input.element.value).toBe('example');
    } finally {
      wrapper.unmount();
    }
  });

  it('shows the empty-state hint when there are no links', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    expect(wrapper.find('.empty-hint').exists()).toBe(true);
  });

  it('requires all three fields', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: '', description: '' });
    await wrapper.find('.btn-primary').trigger('click');
    expect(wrapper.find('.error').text()).toContain('complete all three fields');
    expect(saveLinks).not.toHaveBeenCalled();
  });

  it('validates the URL', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'not a url', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    expect(wrapper.find('.error').text()).toContain('valid URL');
    expect(saveLinks).not.toHaveBeenCalled();
  });

  it('adds a valid entry, normalizing the URL, and renders it', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'github.com/x', description: 'The repo' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    expect(saveLinks).toHaveBeenCalled();
    expect(wrapper.text()).toContain('https://github.com/x');
    expect(wrapper.text()).toContain('The repo');
  });

  it('collapses newlines in the description to a single line', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'a\nb\n\nc' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    const saved = saveLinks.mock.calls.at(-1)[0];
    expect(saved[0].links[0].description).toBe('a b c');
  });

  it('toggles the category dropdown and lists the default category', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await wrapper.find('.category-toggle').trigger('click');
    const options = wrapper.findAll('.category-option').map((o) => o.text());
    expect(options).toContain('GitHub');
  });

  it('expands categories by default and toggles Collapse all / Expand all', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    // No toggle until there is at least one category
    expect(wrapper.find('.expand-toggle').exists()).toBe(false);

    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();

    const toggle = wrapper.find('.expand-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toBe('Collapse all');
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');

    await toggle.trigger('click');
    expect(wrapper.find('.expand-toggle').text()).toBe('Expand all');
    expect(wrapper.find('ul.link-box').element.style.display).toBe('none');

    await wrapper.find('.expand-toggle').trigger('click');
    expect(wrapper.find('.expand-toggle').text()).toBe('Collapse all');
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
  });

  it('keeps a category expanded while its context menu is open', async () => {
    const wrapper = mount(LinksTab, { attachTo: document.body });
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'A link' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();

    // Collapse all so the box is only open via hover / the context menu
    await wrapper.find('.expand-toggle').trigger('click');
    expect(wrapper.find('ul.link-box').element.style.display).toBe('none');

    const section = wrapper.find('.link-list');
    await section.trigger('mouseenter');
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');

    // Double-click an entry to open the Edit/Delete menu
    await wrapper.find('.link-item .link-description').trigger('dblclick');
    await flushPromises();

    // A backdrop stealing the pointer would normally collapse the box, but it
    // must stay open while the context menu for this category is open
    await section.trigger('mouseleave');
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    wrapper.unmount();
  });

  it('shows the spacebar hint after the toggle as plain (non-link) text', async () => {
    const wrapper = mount(LinksTab);
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    const hint = wrapper.find('.expand-hint');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toBe('(press spacebar to toggle)');
    expect(hint.element.tagName).toBe('SPAN');
  });

  it('toggles expand/collapse on spacebar when active and focus is not in a field', async () => {
    const wrapper = mount(LinksTab, { props: { active: true }, attachTo: document.body });
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await flushPromises();
    expect(wrapper.find('ul.link-box').element.style.display).toBe('none');
    expect(wrapper.find('.expand-toggle').text()).toBe('Expand all');
    wrapper.unmount();
  });

  it('does not toggle on spacebar when focus is in a text field', async () => {
    const wrapper = mount(LinksTab, { props: { active: true }, attachTo: document.body });
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    wrapper.find('#link-url').element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await flushPromises();
    // Default is expanded; a spacebar in a field must not collapse it
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    wrapper.unmount();
  });

  it('does not toggle on spacebar when the tab is not active', async () => {
    const wrapper = mount(LinksTab, { props: { active: false }, attachTo: document.body });
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await flushPromises();
    // Default is expanded; a spacebar while inactive must not collapse it
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    wrapper.unmount();
  });

  it('does not double-toggle when the toggle button itself is focused', async () => {
    const wrapper = mount(LinksTab, { props: { active: true }, attachTo: document.body });
    await flushPromises();
    await fill(wrapper, { category: 'GitHub', url: 'https://x.com', description: 'd' });
    await wrapper.find('.btn-primary').trigger('click');
    await flushPromises();
    // With the toggle button as the target, the handler skips it (the button's
    // own activation performs the single toggle in a real browser).
    wrapper.find('.expand-toggle').element.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    );
    await flushPromises();
    // Default is expanded and the handler skipped the button, so it stays open
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    wrapper.unmount();
  });
});
