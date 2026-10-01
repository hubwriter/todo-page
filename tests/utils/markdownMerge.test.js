import { describe, expect, it } from 'vitest';
import { mergeMarkdown } from '../../src/utils/markdownMerge.js';

describe('mergeMarkdown', () => {
  it('automatically combines non-overlapping edits', () => {
    const result = mergeMarkdown('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n');
    expect(result.conflicts).toHaveLength(0);
    expect(result.content).toBe('A\nb\nC\n');
  });

  it('returns ordered overlapping conflicts with Current and Other text', () => {
    const result = mergeMarkdown('a\nbase\nz', 'a\ncurrent\nz', 'a\nother\nz');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      base: 'base',
      current: 'current',
      other: 'other'
    });
    result.conflicts[0].resolution = 'edited';
    expect(result.assemble(result.conflicts)).toBe('a\nedited\nz');
  });

  it('handles additions, deletions, and a trailing newline deterministically', () => {
    const result = mergeMarkdown('one\ntwo\n', 'one\n', 'zero\none\ntwo\n');
    expect(result.conflicts).toHaveLength(0);
    expect(result.content).toBe('zero\none\n');
  });
});
