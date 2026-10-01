import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  RateLimitError,
  ResourceProtocolError
} from '../../src/api/resourceErrors.js';
import ConflictResolutionDialog from '../../src/components/ConflictResolutionDialog.vue';
import { useConflictAwareSave } from '../../src/composables/useConflictAwareSave.js';
import { useConflictDialogQueue } from '../../src/composables/useConflictDialogQueue.js';
import { mergeMarkdown } from '../../src/utils/markdownMerge.js';

function createCoordinator(saveRemote, options = {}) {
  return useConflictAwareSave({
    resource: 'todo',
    saveRemote,
    merge: mergeMarkdown,
    snapshotFromResponse: (response) => response.content,
    rateLimitRetryDelays: [],
    ...options
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useConflictAwareSave', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('automatically rebases and retries a clean stale write', async () => {
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', {
        content: 'a\nb\nOther\n',
        version: 'v2'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nb\nc\n', version: 'v1' });

    await coordinator.save('Current\nb\nc\n');

    expect(saveRemote).toHaveBeenCalledTimes(2);
    expect(saveRemote.mock.calls[1][0]).toBe('Current\nb\nOther\n');
    expect(saveRemote.mock.calls[1][1]).toBe('v2');
    expect(coordinator.dirty.value).toBe(false);
  });

  it('publishes a clean merged candidate before a failed retry and retains it in the next save', async () => {
    let visible = '';
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', {
        content: 'a\nb\nRemote\n',
        version: 'v2'
      }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    const coordinator = createCoordinator(saveRemote, {
      onCandidate: (content) => {
        visible = content;
      }
    });
    visible = coordinator.initialize({ content: 'a\nb\nc\n', version: 'v1' });

    await expect(coordinator.save('Local\nb\nc\n')).rejects.toThrow('offline');

    expect(visible).toBe('Local\nb\nRemote\n');
    expect(coordinator.localCandidate.value).toBe(visible);
    expect(coordinator.dirty.value).toBe(true);
    expect(coordinator.unresolved.value).toBe(false);

    visible = `${visible}Next\n`;
    await coordinator.save(visible);

    expect(saveRemote.mock.calls[2]).toEqual([
      'Local\nb\nRemote\nNext\n',
      'v2',
      {}
    ]);
    expect(coordinator.dirty.value).toBe(false);
  });

  it('closes a stale conflict workflow when clean rebase retries reach the limit', async () => {
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', {
        content: 'a\nOther\nz',
        version: 'v2'
      }))
      .mockRejectedValueOnce(new ConflictError('stale again', {
        content: 'Remote addition\na\nOther\nz',
        version: 'v3'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v4' }));
    const coordinator = createCoordinator(saveRemote, { retryLimit: 0 });
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });

    await coordinator.save('a\nCurrent\nz');
    const queue = useConflictDialogQueue();
    const staleWorkflow = queue.activeConflict.value;
    staleWorkflow.conflicts[0].resolution = 'Resolved';
    staleWorkflow.conflicts[0].resolved = true;
    await staleWorkflow.apply(staleWorkflow.conflicts);

    expect(queue.activeConflict.value).toBeNull();
    expect(coordinator.localCandidate.value).toBe('Remote addition\na\nResolved\nz');
    expect(coordinator.contention.value).toContain('Changes keep arriving');

    await coordinator.save(coordinator.localCandidate.value);
    expect(saveRemote.mock.calls[2]).toEqual([
      'Remote addition\na\nResolved\nz',
      'v3',
      {}
    ]);
    expect(coordinator.dirty.value).toBe(false);
  });

  it('persists canceled conflict drafts and rebases again if the save races', async () => {
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', {
        content: 'a\nOther\nz',
        version: 'v2'
      }))
      .mockRejectedValueOnce(new ConflictError('stale again', {
        content: 'a\nNewest\nz',
        version: 'v3'
      }))
      .mockRejectedValueOnce(new ConflictError('stale during resolution', {
        content: 'a\nNewest again\nz',
        version: 'v4'
      }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });

    await coordinator.save('a\nCurrent\nz');
    const queue = useConflictDialogQueue();
    expect(queue.activeConflict.value.resource).toBe('todo');
    queue.activeConflict.value.cancel(queue.activeConflict.value.conflicts);
    expect(coordinator.unresolved.value).toBe(true);
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toContain('Current');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await coordinator.save('a\nCurrent\nz');
    const firstWorkflow = queue.activeConflict.value;
    expect(saveRemote).toHaveBeenCalledTimes(1);
    firstWorkflow.cancel(firstWorkflow.conflicts);
    await coordinator.save('a\nCurrent\nz');
    expect(saveRemote).toHaveBeenCalledTimes(1);
    const resumedWorkflow = queue.activeConflict.value;
    resumedWorkflow.conflicts[0].resolution = 'Resolved';
    resumedWorkflow.conflicts[0].resolved = true;
    await resumedWorkflow.apply(resumedWorkflow.conflicts);

    expect(saveRemote).toHaveBeenCalledTimes(2);
    const rebasedWorkflow = queue.activeConflict.value;
    rebasedWorkflow.conflicts[0].resolution = 'Resolved again';
    rebasedWorkflow.conflicts[0].resolved = true;
    await rebasedWorkflow.apply(rebasedWorkflow.conflicts);

    expect(saveRemote).toHaveBeenCalledTimes(3);
    expect(coordinator.version.value).toBe('v4');
    expect(queue.activeConflict.value.conflicts[0].other).toBe('Newest again');
    coordinator.discard();
  });

  it('never directly saves unresolved local content after canceling a conflict', async () => {
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', {
        content: 'a\nOther\nz',
        version: 'v2'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });

    await coordinator.save('a\nCurrent\nz');
    const queue = useConflictDialogQueue();
    queue.activeConflict.value.cancel(queue.activeConflict.value.conflicts);

    await coordinator.save('a\nCurrent\nz');
    expect(saveRemote).toHaveBeenCalledTimes(1);
    expect(queue.activeConflict.value.conflicts[0]).toMatchObject({
      current: 'Current',
      other: 'Other'
    });

    queue.activeConflict.value.conflicts[0].resolution = 'Resolved';
    queue.activeConflict.value.conflicts[0].resolved = true;
    await queue.activeConflict.value.apply(queue.activeConflict.value.conflicts);

    expect(saveRemote).toHaveBeenCalledTimes(2);
    expect(saveRemote.mock.calls[1]).toEqual(['a\nResolved\nz', 'v2', {}]);
    expect(coordinator.dirty.value).toBe(false);
  });

  it('restores a draft against a newer remote and resumes canceled conflicts before saving', async () => {
    const first = createCoordinator(vi.fn());
    first.initialize({ content: 'a\nBase\nz', version: 'v1' });
    first.markDirty('a\nCurrent\nz');

    const saveRemote = vi.fn(async (content) => ({ content, version: 'v3' }));
    const restored = createCoordinator(saveRemote);
    restored.initialize({ content: 'a\nOther\nz', version: 'v2' });
    const queue = useConflictDialogQueue();

    expect(JSON.parse(sessionStorage.getItem('todo-page-conflict:todo'))).toMatchObject({
      state: 'conflicts',
      baseSnapshot: 'a\nOther\nz',
      baseVersion: 'v2',
      conflictOrigin: 'a\nBase\nz'
    });

    queue.activeConflict.value.cancel(queue.activeConflict.value.conflicts);
    await restored.save('a\nCurrent\nz');

    expect(saveRemote).not.toHaveBeenCalled();
    expect(queue.activeConflict.value.conflicts[0]).toMatchObject({
      current: 'Current',
      other: 'Other'
    });
    restored.discard();
  });

  it('keeps edits after bounded rate-limit retries are exhausted', async () => {
    const saveRemote = vi.fn(() => Promise.reject(new RateLimitError('Slow down')));
    const coordinator = createCoordinator(saveRemote, { rateLimitRetryDelays: [0, 0] });
    coordinator.initialize({ content: 'base', version: 'v1' });
    await expect(coordinator.save('candidate')).rejects.toThrow('Slow down');
    expect(saveRemote).toHaveBeenCalledTimes(3);
    expect(coordinator.dirty.value).toBe(true);
    expect(coordinator.error.value).toContain('save again');
  });

  it('keeps markDirty and saves functional when sessionStorage quota is exceeded', async () => {
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      });
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saveRemote = vi.fn(async (content) => ({ content, version: 'v2' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'base', version: 'v1' });

    expect(() => coordinator.markDirty('candidate')).not.toThrow();
    await expect(coordinator.save('candidate')).resolves.toBe('candidate');
    expect(saveRemote).toHaveBeenCalledWith('candidate', 'v1', {});
    expect(coordinator.recoveryWarning.value).toContain('Keep this tab open');

    storageSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('restores an unresolved conflict workflow after a same-tab reload', async () => {
    const merge = () => ({
      conflicts: [
        { id: 'one', label: 'One', base: 'base one', current: 'current one', other: 'other one', resolution: 'current one', resolved: false },
        { id: 'two', label: 'Two', base: 'base two', current: 'current two', other: 'other two', resolution: 'current two', resolved: false }
      ],
      assemble: (resolutions) => resolutions.map((conflict) => conflict.resolution).join('\n')
    });
    const first = createCoordinator(vi.fn().mockRejectedValueOnce(new ConflictError('stale', {
      content: 'remote',
      version: 'v2'
    })), { merge });
    first.initialize({ content: 'base', version: 'v1' });
    await first.save('current');
    const queue = useConflictDialogQueue();
    const edited = queue.activeConflict.value.conflicts.map((conflict, index) => ({
      ...conflict,
      resolution: `draft resolution ${index + 1}`,
      resolved: true
    }));
    queue.activeConflict.value.updateDraft(edited, {
      currentIndex: 1,
      replacementConfirmed: false
    });

    const restored = createCoordinator(vi.fn(), { merge });
    restored.initialize({ content: 'remote', version: 'v2' });
    expect(queue.activeConflict.value.conflicts[1]).toMatchObject({
      resolution: 'draft resolution 2',
      resolved: true
    });
    expect(queue.activeConflict.value.currentIndex).toBe(1);
    restored.discard();
  });

  it('persists live conflict edits and the current index without saving remotely', async () => {
    const saveRemote = vi.fn().mockRejectedValueOnce(new ConflictError('stale', {
      content: 'a\nOther\nz',
      version: 'v2'
    }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });
    await coordinator.save('a\nCurrent\nz');
    const workflow = useConflictDialogQueue().activeConflict.value;
    const edited = workflow.conflicts.map((conflict) => ({
      ...conflict,
      resolution: 'live draft',
      resolved: true
    }));

    workflow.updateDraft(edited, { currentIndex: 0, replacementConfirmed: false });

    expect(saveRemote).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem('todo-page-conflict:todo'))).toMatchObject({
      currentIndex: 0,
      conflicts: [expect.objectContaining({ resolution: 'live draft', resolved: true })]
    });
    coordinator.discard();
  });

  it('restores the resolved candidate while its final conditional save is in flight', async () => {
    let finishSave;
    const finalSave = new Promise((resolve) => {
      finishSave = resolve;
    });
    const merge = vi.fn(() => ({
      conflicts: [{
        id: 'one',
        label: 'One',
        base: 'base',
        current: 'current',
        other: 'remote',
        resolution: 'current',
        resolved: false
      }],
      assemble: (resolutions) => resolutions[0].resolution
    }));
    const first = createCoordinator(
      vi.fn()
        .mockRejectedValueOnce(new ConflictError('stale', { content: 'remote', version: 'v2' }))
        .mockReturnValueOnce(finalSave),
      { merge }
    );
    first.initialize({ content: 'base', version: 'v1' });
    await first.save('current');
    const workflow = useConflictDialogQueue().activeConflict.value;
    workflow.conflicts[0].resolution = 'resolved candidate';
    workflow.conflicts[0].resolved = true;
    const pendingApply = workflow.apply(workflow.conflicts);

    const stored = JSON.parse(sessionStorage.getItem('todo-page-conflict:todo'));
    expect(stored).toMatchObject({
      state: 'resolved',
      baseSnapshot: 'remote',
      baseVersion: 'v2',
      candidate: 'resolved candidate',
      conflicts: []
    });

    const restoredMerge = vi.fn();
    let visible = '';
    const restored = createCoordinator(vi.fn(), {
      merge: restoredMerge,
      onCandidate: (candidate) => {
        visible = candidate;
      }
    });
    expect(restored.initialize({ content: 'remote', version: 'v2' })).toBe('resolved candidate');
    expect(visible).toBe('resolved candidate');
    expect(restored.dirty.value).toBe(true);
    expect(restored.unresolved.value).toBe(false);
    expect(restoredMerge).not.toHaveBeenCalled();

    finishSave({ content: 'resolved candidate', version: 'v3' });
    await pendingApply;
    restored.discard();
  });

  it('restores a resolved candidate after network failure and retries it successfully', async () => {
    const firstSave = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', { content: 'remote', version: 'v2' }))
      .mockRejectedValueOnce(new Error('offline'));
    const first = createCoordinator(firstSave);
    first.initialize({ content: 'a\nBase\nz', version: 'v1' });
    await first.save('a\nCurrent\nz');
    const workflow = useConflictDialogQueue().activeConflict.value;
    workflow.conflicts[0].resolution = 'Resolved';
    workflow.conflicts[0].resolved = true;
    await expect(workflow.apply(workflow.conflicts)).rejects.toThrow('offline');

    const retrySave = vi.fn(async (content) => ({ content, version: 'v3' }));
    let visible = '';
    const restored = createCoordinator(retrySave, {
      merge: vi.fn(() => {
        throw new Error('resolved drafts must not be merged during initialization');
      }),
      onCandidate: (candidate) => {
        visible = candidate;
      }
    });
    const candidate = restored.initialize({ content: 'a\nOther\nz', version: 'v2' });

    expect(candidate).toBe('Resolved');
    expect(visible).toBe(candidate);
    expect(restored.dirty.value).toBe(true);
    expect(restored.unresolved.value).toBe(false);

    await restored.save(candidate);

    expect(retrySave).toHaveBeenCalledWith('Resolved', 'v2', {});
    expect(restored.dirty.value).toBe(false);
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toBeNull();
  });

  it.each([
    ['network', new TypeError('Failed to fetch'), 'Check your connection'],
    [
      'protocol',
      new ResourceProtocolError(
        'missing version',
        'Restart the app server, then try again. Your edits are still here.'
      ),
      'Restart the app server'
    ],
    [
      'backup',
      Object.assign(new Error('Failed to create todo backup'), {
        payload: { error: 'Failed to create todo backup' }
      }),
      'safety backup'
    ]
  ])('keeps the conflict workflow open after a %s final apply failure and closes it after retry', async (_kind, failure, message) => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', { content: 'a\nOther\nz', version: 'v2' }))
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });
    await coordinator.save('a\nCurrent\nz');
    const queue = useConflictDialogQueue();
    const workflow = queue.activeConflict.value;
    workflow.conflicts[0].resolution = 'Resolved';
    workflow.conflicts[0].resolved = true;

    await expect(workflow.apply(workflow.conflicts)).rejects.toMatchObject({
      userMessage: expect.stringContaining(message)
    });

    expect(queue.activeConflict.value).toBe(workflow);
    expect(queue.activeConflict.value.conflicts[0].resolution).toBe('Resolved');
    expect(consoleSpy).toHaveBeenCalledWith('Error saving todo:', failure);

    await workflow.apply(workflow.conflicts);

    expect(queue.activeConflict.value).toBeNull();
    expect(coordinator.dirty.value).toBe(false);
    consoleSpy.mockRestore();
  });

  it('preserves the original focus target when a rebase replaces the active workflow', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('stale', { content: 'a\nOther\nz', version: 'v2' }))
      .mockRejectedValueOnce(new ConflictError('stale again', { content: 'a\nNewest\nz', version: 'v3' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });
    await coordinator.save('a\nCurrent\nz');
    const queue = useConflictDialogQueue();
    const firstWorkflow = queue.activeConflict.value;
    firstWorkflow.conflicts[0].resolution = 'Resolved';
    firstWorkflow.conflicts[0].resolved = true;

    await firstWorkflow.apply(firstWorkflow.conflicts);

    expect(queue.activeConflict.value).not.toBe(firstWorkflow);
    expect(queue.activeConflict.value.focusReturnTarget).toBe(trigger);
    coordinator.discard();
    trigger.remove();
  });

  it('restores focus to each initiating tab across separate completed conflict episodes', async () => {
    const saveRemote = vi.fn()
      .mockRejectedValueOnce(new ConflictError('first stale write', {
        content: 'a\nFirst remote\nz',
        version: 'v2'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }))
      .mockRejectedValueOnce(new ConflictError('second stale write', {
        content: 'a\nSecond remote\nz',
        version: 'v4'
      }))
      .mockImplementationOnce(async (content) => ({ content, version: 'v5' }));
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'a\nBase\nz', version: 'v1' });
    const queue = useConflictDialogQueue();
    const wrapper = mount({
      components: { ConflictResolutionDialog },
      setup() {
        return { activeConflict: queue.activeConflict };
      },
      template: `
        <div>
          <button id="tasks-tab" role="tab">Tasks</button>
          <button id="markdown-tab" role="tab">Markdown</button>
          <ConflictResolutionDialog
            v-if="activeConflict"
            :key="activeConflict.revision"
            :workflow="activeConflict"
          />
        </div>
      `
    }, { attachTo: document.body });

    try {
      const tasksTab = wrapper.find('#tasks-tab').element;
      tasksTab.focus();
      await coordinator.save('a\nFirst local\nz');
      await flushPromises();
      expect(queue.activeConflict.value.focusReturnTarget).toBe(tasksTab);

      await wrapper.find('textarea').setValue('First resolved');
      await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
      await flushPromises();
      expect(queue.activeConflict.value).toBeNull();
      expect(document.activeElement).toBe(tasksTab);

      const markdownTab = wrapper.find('#markdown-tab').element;
      markdownTab.focus();
      await coordinator.save('a\nSecond local\nz');
      await flushPromises();
      expect(queue.activeConflict.value.focusReturnTarget).toBe(markdownTab);

      await wrapper.find('textarea').setValue('Second resolved');
      await wrapper.findAll('button').find((button) => button.text() === 'Apply and save').trigger('click');
      await flushPromises();
      expect(queue.activeConflict.value).toBeNull();
      expect(document.activeElement).toBe(markdownTab);
    } finally {
      coordinator.discard();
      wrapper.unmount();
    }
  });

  it('rebases newer local edits over an accepted in-flight save and retains the draft', async () => {
    const firstSave = deferred();
    const saveRemote = vi.fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockImplementationOnce(async (content) => ({ content, version: 'v3' }));
    let visible = '';
    const coordinator = createCoordinator(saveRemote, {
      onCandidate: (candidate) => {
        visible = candidate;
      }
    });
    visible = coordinator.initialize({ content: 'Base\nTail\n', version: 'v1' });

    const pending = coordinator.save('First edit\nTail\n');
    await vi.waitFor(() => expect(saveRemote).toHaveBeenCalledTimes(1));
    coordinator.markDirty('First edit\nTail\nTyped during autosave\n');

    firstSave.resolve({ content: 'Accepted edit\nTail\n', version: 'v2' });
    await pending;

    expect(visible).toBe('Accepted edit\nTail\nTyped during autosave\n');
    expect(coordinator.localCandidate.value).toBe(visible);
    expect(coordinator.baseSnapshot.value).toBe('Accepted edit\nTail\n');
    expect(coordinator.version.value).toBe('v2');
    expect(coordinator.dirty.value).toBe(true);
    expect(JSON.parse(sessionStorage.getItem('todo-page-conflict:todo'))).toMatchObject({
      baseSnapshot: 'Accepted edit\nTail\n',
      baseVersion: 'v2',
      candidate: 'Accepted edit\nTail\nTyped during autosave\n'
    });

    await coordinator.save(visible);

    expect(saveRemote.mock.calls[1]).toEqual([
      'Accepted edit\nTail\nTyped during autosave\n',
      'v2',
      {}
    ]);
    expect(coordinator.dirty.value).toBe(false);
    expect(sessionStorage.getItem('todo-page-conflict:todo')).toBeNull();
  });

  it('serializes overlapping saves so older responses cannot overwrite newer candidates', async () => {
    const firstSave = deferred();
    const secondSave = deferred();
    const saveRemote = vi.fn()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const coordinator = createCoordinator(saveRemote);
    coordinator.initialize({ content: 'Base\n', version: 'v1' });

    const older = coordinator.save('Older\n');
    await vi.waitFor(() => expect(saveRemote).toHaveBeenCalledTimes(1));
    const newer = coordinator.save('Older\nNewer\n');
    expect(saveRemote).toHaveBeenCalledTimes(1);

    firstSave.resolve({ content: 'Older\n', version: 'v2' });
    await older;
    await vi.waitFor(() => expect(saveRemote).toHaveBeenCalledTimes(2));
    expect(saveRemote.mock.calls[1]).toEqual(['Older\nNewer\n', 'v2', {}]);

    secondSave.resolve({ content: 'Older\nNewer\n', version: 'v3' });
    await newer;

    expect(coordinator.localCandidate.value).toBe('Older\nNewer\n');
    expect(coordinator.version.value).toBe('v3');
    expect(coordinator.dirty.value).toBe(false);
  });

  it('rejects a success response with an undefined snapshot without leaking a split exception', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const coordinator = createCoordinator(vi.fn(async () => ({ success: true })));
    coordinator.initialize({ content: 'Base\n', version: 'v1' });

    try {
      await expect(coordinator.save('Edited\n')).rejects.toMatchObject({
        name: 'ResourceProtocolError',
        message: expect.stringContaining('snapshot=undefined')
      });
      expect(coordinator.localCandidate.value).toBe('Edited\n');
      expect(coordinator.dirty.value).toBe(true);
      expect(coordinator.error.value).toContain('Restart the app server');
      expect(coordinator.error.value).not.toContain('split');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving todo:',
        expect.objectContaining({
          message: expect.stringContaining('snapshot=undefined')
        })
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
