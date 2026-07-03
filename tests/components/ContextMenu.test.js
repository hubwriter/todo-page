import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ContextMenu from '../../src/components/ContextMenu.vue';

describe('ContextMenu', () => {
  it('shows Edit, Move to "Other" and Delete for Priority', () => {
    const wrapper = mount(ContextMenu, { props: { show: true, x: 0, y: 0, listType: 'Priority' } });
    const text = wrapper.text();
    expect(text).toContain('Edit');
    expect(text).toContain('Move to "Other"');
    expect(text).toContain('Delete');
  });

  it('shows Move to "Priority" for Other', () => {
    const wrapper = mount(ContextMenu, { props: { show: true, x: 0, y: 0, listType: 'Other' } });
    expect(wrapper.text()).toContain('Move to "Priority"');
  });

  it('shows only Delete for Done', () => {
    const wrapper = mount(ContextMenu, { props: { show: true, x: 0, y: 0, listType: 'Done' } });
    expect(wrapper.text()).toContain('Delete');
    expect(wrapper.text()).not.toContain('Edit');
    expect(wrapper.text()).not.toContain('Move to');
  });

  it('emits actions for each menu item', async () => {
    const wrapper = mount(ContextMenu, { props: { show: true, x: 0, y: 0, listType: 'Priority' } });
    const buttons = wrapper.findAll('.context-menu-item');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    await buttons[2].trigger('click');
    expect(wrapper.emitted('edit')).toBeTruthy();
    expect(wrapper.emitted('move-to-other')).toBeTruthy();
    expect(wrapper.emitted('delete')).toBeTruthy();
  });

  it('emits close on backdrop click', async () => {
    const wrapper = mount(ContextMenu, { props: { show: true, x: 0, y: 0, listType: 'Priority' } });
    await wrapper.find('.context-menu-backdrop').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
