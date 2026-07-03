import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LinkContextMenu from '../../src/components/LinkContextMenu.vue';

describe('LinkContextMenu', () => {
  it('is hidden when show is false', () => {
    const wrapper = mount(LinkContextMenu, { props: { show: false, x: 0, y: 0 } });
    expect(wrapper.find('.context-menu').exists()).toBe(false);
  });

  it('renders Edit and Delete when shown', () => {
    const wrapper = mount(LinkContextMenu, { props: { show: true, x: 5, y: 6 } });
    expect(wrapper.findAll('.context-menu-item')).toHaveLength(2);
    expect(wrapper.text()).toContain('Edit');
    expect(wrapper.text()).toContain('Delete');
  });

  it('emits edit and delete', async () => {
    const wrapper = mount(LinkContextMenu, { props: { show: true, x: 0, y: 0 } });
    const buttons = wrapper.findAll('.context-menu-item');
    await buttons[0].trigger('click');
    await buttons[1].trigger('click');
    expect(wrapper.emitted('edit')).toBeTruthy();
    expect(wrapper.emitted('delete')).toBeTruthy();
  });

  it('emits close when the backdrop is clicked', async () => {
    const wrapper = mount(LinkContextMenu, { props: { show: true, x: 0, y: 0 } });
    await wrapper.find('.context-menu-backdrop').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('positions the menu using x and y', () => {
    const wrapper = mount(LinkContextMenu, { props: { show: true, x: 12, y: 34 } });
    const style = wrapper.find('.context-menu').attributes('style');
    expect(style).toContain('left: 12px');
    expect(style).toContain('top: 34px');
  });
});
