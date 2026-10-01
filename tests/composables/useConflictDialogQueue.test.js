import { beforeEach, describe, expect, it } from 'vitest';
import {
  closeConflictDialog,
  queueConflictDialog,
  useConflictDialogQueue
} from '../../src/composables/useConflictDialogQueue.js';

describe('useConflictDialogQueue', () => {
  beforeEach(() => {
    closeConflictDialog('todo');
    closeConflictDialog('links');
  });

  it('shows conflicts for different resources one at a time', () => {
    queueConflictDialog({ resource: 'todo' });
    queueConflictDialog({ resource: 'links' });

    expect(useConflictDialogQueue().activeConflict.value.resource).toBe('todo');

    closeConflictDialog('todo');
    expect(useConflictDialogQueue().activeConflict.value.resource).toBe('links');

    closeConflictDialog('links');
    expect(useConflictDialogQueue().activeConflict.value).toBeNull();
  });
});
