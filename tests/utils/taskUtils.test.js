import { describe, it, expect } from 'vitest';
import { moveTask, calculateDropPosition, getTaskList } from '../../src/utils/taskUtils.js';

describe('moveTask', () => {
  it('moves an item between arrays at the target index', () => {
    const source = ['a', 'b', 'c'];
    const target = ['x', 'y'];
    const moved = moveTask({ sourceList: source, sourceIndex: 1, targetList: target, targetIndex: 1 });
    expect(moved).toBe('b');
    expect(source).toEqual(['a', 'c']);
    expect(target).toEqual(['x', 'b', 'y']);
  });

  it('defaults targetIndex to 0', () => {
    const source = ['a'];
    const target = ['x'];
    moveTask({ sourceList: source, sourceIndex: 0, targetList: target });
    expect(target).toEqual(['a', 'x']);
  });

  it('applies transformTask', () => {
    const source = ['task'];
    const target = [];
    const moved = moveTask({
      sourceList: source,
      sourceIndex: 0,
      targetList: target,
      transformTask: (t) => `2025-01-01 - ${t}`
    });
    expect(moved).toBe('2025-01-01 - task');
    expect(target).toEqual(['2025-01-01 - task']);
  });
});

describe('getTaskList', () => {
  const lists = { priority: ['p'], other: ['o'], done: ['d'] };

  it('maps section names to lists', () => {
    expect(getTaskList('Priority', lists)).toBe(lists.priority);
    expect(getTaskList('Other', lists)).toBe(lists.other);
    expect(getTaskList('Done', lists)).toBe(lists.done);
  });

  it('returns an empty array for unknown sections', () => {
    expect(getTaskList('Nope', lists)).toEqual([]);
  });
});

describe('calculateDropPosition', () => {
  function makeListElement(childMiddles) {
    const children = childMiddles.map((mid) => ({
      getBoundingClientRect: () => ({ top: mid - 10, height: 20 }) // middle === mid
    }));
    return { children };
  }

  it('returns the index of the first child whose middle is below the cursor', () => {
    const el = makeListElement([50, 100, 150]);
    expect(calculateDropPosition({ clientY: 40 }, el)).toBe(0);
    expect(calculateDropPosition({ clientY: 90 }, el)).toBe(1);
    expect(calculateDropPosition({ clientY: 140 }, el)).toBe(2);
  });

  it('returns children length when the cursor is below all items', () => {
    const el = makeListElement([50, 100]);
    expect(calculateDropPosition({ clientY: 500 }, el)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(calculateDropPosition({ clientY: 10 }, { children: [] })).toBe(0);
  });
});
