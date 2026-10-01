import { describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ConflictResolutionDialog from '../../src/components/ConflictResolutionDialog.vue';

function workflow(overrides = {}) {
  return {
    resource: 'todo',
    resourceName: 'Tasks and Markdown',
    conflicts: [
      { id: 'one', label: 'One', base: 'base 1', current: 'current 1', other: 'other 1', resolution: 'current 1', resolved: false },
      { id: 'two', label: 'Two', base: 'base 2', current: 'current 2', other: 'other 2', resolution: 'current 2', resolved: false }
    ],
    apply: vi.fn(() => Promise.resolve()),
    cancel: vi.fn(),
    ...overrides
  };
}

describe('ConflictResolutionDialog', () => {
  it('undoes and redoes edits to the current conflict resolution', async () => {
    const active = workflow();
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active } });
    const textarea = wrapper.find('textarea');

    await textarea.setValue('edited resolution');
    await textarea.trigger('keydown', { key: 'z', metaKey: true });
    expect(textarea.element.value).toBe('current 1');

    await textarea.trigger('keydown', { key: 'z', metaKey: true, shiftKey: true });
    expect(textarea.element.value).toBe('edited resolution');
    wrapper.unmount();
  });

  it('steps through Current, Other, and edited resolutions while retaining decisions', async () => {
    const active = workflow({ updateDraft: vi.fn() });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.findAll('button').find((button) => button.text() === 'Use Other change').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and next').trigger('click');
    await wrapper.find('textarea').setValue('edited second');
    await wrapper.findAll('button').find((button) => button.text() === 'Previous').trigger('click');
    expect(wrapper.find('textarea').element.value).toBe('other 1');
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and next').trigger('click');
    expect(wrapper.find('textarea').element.value).toBe('edited second');
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    expect(active.apply).toHaveBeenCalledWith([
      expect.objectContaining({ resolution: 'other 1', resolved: true }),
      expect.objectContaining({ resolution: 'edited second', resolved: true })
    ]);
    expect(active.updateDraft).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ resolution: 'other 1', resolved: true }),
        expect.objectContaining({ resolution: 'edited second', resolved: true })
      ]),
      expect.objectContaining({ currentIndex: 1 })
    );
    wrapper.unmount();
  });

  it('restores live resolutions and the current position when remounted', async () => {
    const active = workflow();
    active.updateDraft = vi.fn((conflicts, state) => {
      active.conflicts = conflicts;
      Object.assign(active, state);
    });
    let wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.findAll('button').find((button) => button.text() === 'Use Other change').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and next').trigger('click');
    await wrapper.find('textarea').setValue('in-progress second');
    wrapper.unmount();

    wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    expect(wrapper.text()).toContain('Conflict 2 of 2');
    expect(wrapper.find('textarea').element.value).toBe('in-progress second');
    await wrapper.findAll('button').find((button) => button.text() === 'Previous').trigger('click');
    expect(wrapper.find('textarea').element.value).toBe('other 1');
    wrapper.unmount();
  });

  it('cancels on Escape without discarding the resolutions', async () => {
    const active = workflow();
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.find('textarea').setValue('draft resolution');
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(active.cancel).toHaveBeenCalledWith([
      expect.objectContaining({ resolution: 'draft resolution', resolved: true }),
      expect.any(Object)
    ]);
    wrapper.unmount();
  });

  it('keeps the dialog open when an edited resolution is invalid', async () => {
    const active = workflow({
      conflicts: [
        { id: 'one', label: 'One', base: 'base', current: 'current', other: 'other', resolution: 'current', resolved: false }
      ],
      validate: () => ({ valid: false, error: 'Invalid resolution' })
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active } });
    await wrapper.findAll('button').find((button) => button.text() === 'Use Current change').trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    expect(wrapper.find('[role="alert"]').text()).toBe('Invalid resolution');
    expect(active.apply).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('refreshes identical conflict IDs when a rebased workflow replaces the prop', async () => {
    const first = workflow({
      revision: 1,
      conflicts: [
        { id: 'same', label: 'Same', base: 'old base', current: 'old current', other: 'old other', resolution: 'old draft', resolved: true }
      ]
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: first } });
    await wrapper.setProps({
      workflow: workflow({
        revision: 2,
        conflicts: [
          { id: 'same', label: 'Same', base: 'new base', current: 'new current', other: 'new other', resolution: 'new draft', resolved: false }
        ]
      })
    });

    expect(wrapper.text()).toContain('new current');
    expect(wrapper.text()).toContain('new other');
    expect(wrapper.text()).not.toContain('old current');
    expect(wrapper.find('textarea').element.value).toBe('new draft');
  });

  it('requires explicit confirmation before replacing an invalid links file', async () => {
    const active = workflow({
      resource: 'links',
      resourceName: 'Links',
      requiresReplacementConfirmation: true,
      replacementConfirmationLabel: 'Replace the invalid links file.',
      conflicts: [
        { id: 'invalid', label: 'Invalid file', base: 'valid', current: 'keep', other: '{broken', resolution: 'keep', resolved: true }
      ]
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active } });
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    expect(active.apply).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').text()).toContain('Confirm');

    await wrapper.find('.replacement-confirmation input').setValue(true);
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    expect(active.apply).toHaveBeenCalledWith(
      expect.any(Array),
      { replacementConfirmed: true }
    );
  });

  it('tabs to the replacement checkbox, toggles it, and completes the resolution', async () => {
    const active = workflow({
      resource: 'links',
      resourceName: 'Links',
      requiresReplacementConfirmation: true,
      replacementConfirmationLabel: 'Replace the invalid links file.',
      conflicts: [
        { id: 'invalid', label: 'Invalid file', base: 'valid', current: 'keep', other: '{broken', resolution: 'keep', resolved: true }
      ],
      updateDraft: vi.fn()
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.vm.$nextTick();
    const textarea = wrapper.find('textarea');
    const checkbox = wrapper.find('.replacement-confirmation input');
    expect(document.activeElement).toBe(textarea.element);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    textarea.element.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
    checkbox.element.focus();
    expect(document.activeElement).toBe(checkbox.element);
    checkbox.element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    checkbox.element.click();
    await wrapper.vm.$nextTick();
    expect(checkbox.element.checked).toBe(true);

    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    expect(active.apply).toHaveBeenCalledWith(expect.any(Array), { replacementConfirmed: true });
    wrapper.unmount();
  });

  it('restores keyboard focus after cancel', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const active = workflow();
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.vm.$nextTick();

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });

  it('restores keyboard focus after a successful resolution', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const active = workflow({
      conflicts: [
        { id: 'one', label: 'One', base: 'base', current: 'current', other: 'other', resolution: 'current', resolved: true }
      ],
      apply: vi.fn(() => Promise.resolve('saved'))
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });

  it.each([
    ['network', Object.assign(new TypeError('Failed to fetch'), { userMessage: 'Check your connection and try again. Your choices are still here.' })],
    ['protocol', Object.assign(new Error('missing version'), { userMessage: 'Restart the app server, then try again. Your choices are still here.' })],
    ['backup', Object.assign(new Error('backup failed'), { userMessage: 'The safety backup could not be created. Check disk space and try again.' })]
  ])('keeps resolutions open and retries after a %s apply failure', async (_kind, failure) => {
    const apply = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce('saved');
    const active = workflow({
      conflicts: [
        { id: 'one', label: 'One', base: 'base', current: 'current', other: 'other', resolution: 'chosen', resolved: true }
      ],
      apply
    });
    const wrapper = mount(ConflictResolutionDialog, { props: { workflow: active }, attachTo: document.body });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toBe(failure.userMessage);
    expect(wrapper.find('textarea').element.value).toBe('chosen');
    expect(document.activeElement).toBe(wrapper.find('textarea').element);

    await flushPromises();
    await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    await flushPromises();

    expect(apply).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it.each(['cancel', 'apply'])('restores the original focus target after a revision remount and final %s', async action => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const first = workflow({ revision: 1, focusReturnTarget: trigger });
    let wrapper = mount(ConflictResolutionDialog, { props: { workflow: first }, attachTo: document.body });
    await wrapper.vm.$nextTick();
    wrapper.unmount();

    const replacement = workflow({
      revision: 2,
      focusReturnTarget: trigger,
      conflicts: [
        { id: 'one', label: 'One', base: 'base', current: 'current', other: 'other', resolution: 'current', resolved: true }
      ]
    });
    wrapper = mount(ConflictResolutionDialog, { props: { workflow: replacement }, attachTo: document.body });
    await wrapper.vm.$nextTick();

    if (action === 'cancel') {
      await wrapper.findAll('button').find((button) => button.text() === 'Cancel and keep editing').trigger('click');
    } else {
      await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
    }

    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });
});
