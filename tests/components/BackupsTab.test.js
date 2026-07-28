import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

vi.mock('../../src/api/backupsApi.js', () => ({
  loadBackups: vi.fn(),
  loadBackupContent: vi.fn()
}));

import BackupsTab from '../../src/components/BackupsTab.vue';
import { loadBackups } from '../../src/api/backupsApi.js';

describe('BackupsTab', () => {
  beforeEach(() => {
    loadBackups.mockReset();
  });

  it('loads and lists backups newest-first with human-readable dates', async () => {
    loadBackups.mockResolvedValue([
      { filename: 'todo-backup-20260728T120000.md', timestamp: new Date(2026, 6, 28, 12, 0, 0).toISOString() },
      { filename: 'todo-backup-20260728T100000.md', timestamp: new Date(2026, 6, 28, 10, 0, 0).toISOString() }
    ]);

    const wrapper = mount(BackupsTab, { props: { active: true } });
    await flushPromises();

    const items = wrapper.findAll('.backup-item');
    expect(items).toHaveLength(2);
    // Human-readable (not the raw filename)
    expect(items[0].text()).not.toContain('todo-backup');
    expect(items[0].text()).toContain('2026');
  });

  it('emits view-backup with the filename when a backup is clicked', async () => {
    loadBackups.mockResolvedValue([
      { filename: 'todo-backup-20260728T120000.md', timestamp: new Date(2026, 6, 28, 12, 0, 0).toISOString() }
    ]);

    const wrapper = mount(BackupsTab, { props: { active: true } });
    await flushPromises();

    await wrapper.find('.backup-item').trigger('click');
    expect(wrapper.emitted('view-backup')[0]).toEqual(['todo-backup-20260728T120000.md']);
  });

  it('shows an empty message when there are no backups', async () => {
    loadBackups.mockResolvedValue([]);
    const wrapper = mount(BackupsTab, { props: { active: true } });
    await flushPromises();
    expect(wrapper.find('.backups-status').exists()).toBe(true);
    expect(wrapper.text()).toContain('No backups yet');
  });

  it('shows an error message when loading backups fails', async () => {
    loadBackups.mockRejectedValue(new Error('boom'));
    const wrapper = mount(BackupsTab, { props: { active: true } });
    await flushPromises();
    const err = wrapper.find('.backups-error');
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain('Error loading backups: boom');
    expect(err.attributes('role')).toBe('alert');
    expect(wrapper.findAll('.backup-item')).toHaveLength(0);
  });

  it('does not load until it becomes active', async () => {
    loadBackups.mockResolvedValue([]);
    const wrapper = mount(BackupsTab, { props: { active: false } });
    await flushPromises();
    expect(loadBackups).not.toHaveBeenCalled();

    await wrapper.setProps({ active: true });
    await flushPromises();
    expect(loadBackups).toHaveBeenCalled();
  });
});
