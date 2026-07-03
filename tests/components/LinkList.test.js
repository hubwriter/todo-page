import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LinkList from '../../src/components/LinkList.vue';

const links = [
  { id: '1', url: 'https://example.com', description: 'A site' },
  { id: '2', url: 'file:///Users/me/notes.md', description: 'Notes' },
  { id: '3', url: 'javascript:alert(1)', description: 'Bad' }
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LinkList', () => {
  it('renders the category heading and entries as a bullet list', () => {
    const wrapper = mount(LinkList, { props: { category: 'GitHub', links } });
    expect(wrapper.find('h2').text()).toContain('GitHub');
    expect(wrapper.find('ul.link-box').exists()).toBe(true);
    expect(wrapper.findAll('li.link-item')).toHaveLength(3);
  });

  it('renders http and file URLs as links with an em dash and description', () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    const items = wrapper.findAll('li.link-item');
    expect(items[0].find('a.link-url').attributes('href')).toBe('https://example.com');
    expect(items[0].text()).toContain('—');
    expect(items[0].text()).toContain('A site');
    expect(items[1].find('a.link-url').attributes('href')).toBe('file:///Users/me/notes.md');
  });

  it('renders markdown in the description (bold and italic)', () => {
    const mdLinks = [
      { id: 'm', url: 'https://example.com', description: 'My **bold** and _italic_ text' }
    ];
    const wrapper = mount(LinkList, { props: { category: 'C', links: mdLinks } });
    const desc = wrapper.find('.link-description');
    expect(desc.find('strong').text()).toBe('bold');
    expect(desc.find('em').text()).toBe('italic');
  });

  it('renders unsafe URLs as plain text, not a link', () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    const third = wrapper.findAll('li.link-item')[2];
    expect(third.find('a.link-url').exists()).toBe(false);
    expect(third.find('span.link-url--invalid').exists()).toBe(true);
  });

  it('emits dragstart with the category and id', async () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    await wrapper.findAll('li.link-item')[0].trigger('dragstart');
    expect(wrapper.emitted('dragstart')[0][1]).toBe('C');
    expect(wrapper.emitted('dragstart')[0][2]).toBe('1');
  });

  it('emits show-context-menu on double click', async () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    await wrapper.findAll('li.link-item')[0].trigger('dblclick');
    expect(wrapper.emitted('show-context-menu')[0][1]).toBe('C');
    expect(wrapper.emitted('show-context-menu')[0][2]).toBe('1');
  });

  it('emits drop with a computed target index', async () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    await wrapper.find('ul.link-box').trigger('drop', { clientY: 0 });
    const dropEvent = wrapper.emitted('drop')[0];
    expect(dropEvent[1]).toBe('C');
    expect(typeof dropEvent[2]).toBe('number');
  });

  it('opens file:// links through the server proxy in the same tab', async () => {
    const assign = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign, href: originalLocation.href }
    });
    try {
      const wrapper = mount(LinkList, { props: { category: 'C', links } });
      await wrapper.findAll('li.link-item')[1].find('a.link-url').trigger('click');
      expect(assign).toHaveBeenCalledWith('/api/local-file?path=' + encodeURIComponent('/Users/me/notes.md'));
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    }
  });

  it('is collapsed by default (box hidden, caret shows collapsed state)', () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    expect(wrapper.find('ul.link-box').element.style.display).toBe('none');
    expect(wrapper.find('.link-caret').text()).toBe('▸');
  });

  it('expands on hover and collapses on mouse leave', async () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links } });
    await wrapper.find('.link-list').trigger('mouseenter');
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    expect(wrapper.find('.link-caret').text()).toBe('▾');
    await wrapper.find('.link-list').trigger('mouseleave');
    expect(wrapper.find('ul.link-box').element.style.display).toBe('none');
  });

  it('stays expanded when the expanded prop is true', () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links, expanded: true } });
    expect(wrapper.find('ul.link-box').element.style.display).not.toBe('none');
    expect(wrapper.find('.link-caret').text()).toBe('▾');
  });

  it('emits dragend', async () => {
    const wrapper = mount(LinkList, { props: { category: 'C', links, expanded: true } });
    await wrapper.findAll('li.link-item')[0].trigger('dragend');
    expect(wrapper.emitted('dragend')).toBeTruthy();
  });
});
