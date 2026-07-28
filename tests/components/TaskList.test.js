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

  it('emits edit-task on command-click (metaKey)', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'] } });
    await wrapper.find('li.task-item').trigger('click', { metaKey: true });
    expect(wrapper.emitted('edit-task')[0]).toEqual(['Priority', 0, 'X']);
  });

  it('emits edit-task on ctrl-click (ctrlKey)', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Other', tasks: ['A', 'B'] } });
    await wrapper.findAll('li.task-item')[1].trigger('click', { ctrlKey: true });
    expect(wrapper.emitted('edit-task')[0]).toEqual(['Other', 1, 'B']);
  });

  it('does not emit edit-task on a plain click', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'] } });
    await wrapper.find('li.task-item').trigger('click');
    expect(wrapper.emitted('edit-task')).toBeFalsy();
  });

  it('is not draggable and suppresses interactions when read-only', async () => {
    const wrapper = mount(TaskList, { props: { listType: 'Priority', tasks: ['X'], readOnly: true } });
    const li = wrapper.find('li.task-item');
    expect(li.attributes('draggable')).toBe('false');
    expect(li.classes()).toContain('read-only');
    expect(wrapper.find('input[type="checkbox"]').element.disabled).toBe(true);

    await li.trigger('dblclick');
    await li.trigger('click', { metaKey: true });
    await li.trigger('dragstart');
    expect(wrapper.emitted('show-context-menu')).toBeFalsy();
    expect(wrapper.emitted('edit-task')).toBeFalsy();
    expect(wrapper.emitted('dragstart')).toBeFalsy();
  });
});
