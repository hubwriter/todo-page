import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TaskList from '../../src/components/TaskList.vue';

describe('TaskList', () => {
  it('renders the list heading and tasks', () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['Task A', 'Task B'] } });
    expect(wrapper.find('h2').text()).toBe('Priority');
    expect(wrapper.findAll('li.task-item')).toHaveLength(2);
    expect(wrapper.text()).toContain('Task A');
  });

  it('renders markdown links in tasks', () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['See [docs](https://example.com)'] } });
    const a = wrapper.find('.task-text a');
    expect(a.exists()).toBe(true);
    expect(a.attributes('href')).toBe('https://example.com');
  });

  it('renders multi-line tasks with continuation lines', () => {
    const wrapper = mount(TaskList, { props: { listType: 'Other', tasks: ['First line\nSecond line'] } });
    expect(wrapper.find('.task-continuation').exists()).toBe(true);
    expect(wrapper.text()).toContain('Second line');
  });

  it('checkbox is checked for Done and unchecked otherwise', () => {
    const done = mount(TaskList, { props: { listType: 'Done', tasks: ['2025-01-01 - X'] } });
    expect(done.find('input[type="checkbox"]').element.checked).toBe(true);
    const pri = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'] } });
    expect(pri.find('input[type="checkbox"]').element.checked).toBe(false);
  });

  it('emits checkbox-change when toggled', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'] } });
    await wrapper.find('input[type="checkbox"]').trigger('change');
    expect(wrapper.emitted('checkbox-change')[0]).toEqual(['Priority', 0]);
  });

  it('emits dragstart and show-context-menu', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'] } });
    await wrapper.find('li.task-item').trigger('dragstart');
    expect(wrapper.emitted('dragstart')).toBeTruthy();
    await wrapper.find('li.task-item').trigger('dblclick');
    expect(wrapper.emitted('show-context-menu')).toBeTruthy();
  });
});
