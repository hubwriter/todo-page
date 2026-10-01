import { describe, expect, it } from 'vitest';
import { mergeLinks } from '../../src/utils/linksMerge.js';

const category = (name, links) => ({ name, links });
const link = (id, url, description) => ({ id, url, description });

describe('mergeLinks', () => {
  it('merges independent additions by stable link ID', () => {
    const base = [category('Docs', [])];
    const current = [category('Docs', [link('current', 'https://current.test', 'Current')])];
    const other = [category('Docs', [link('other', 'https://other.test', 'Other')])];
    const result = mergeLinks(base, current, other);
    expect(result.conflicts).toHaveLength(0);
    expect(result.categories[0].links.map((item) => item.id).sort()).toEqual(['current', 'other']);
  });

  it('preserves independently added and retained empty categories', () => {
    const base = [category('Retained', [])];
    const current = [category('Retained', []), category('Current empty', [])];
    const other = [category('Retained', []), category('Other empty', [])];
    const result = mergeLinks(base, current, other);
    expect(result.conflicts).toHaveLength(0);
    expect(result.categories.map((item) => item.name)).toEqual([
      'Retained',
      'Current empty',
      'Other empty'
    ]);
    expect(result.categories.every((item) => item.links.length === 0)).toBe(true);
  });

  it('reports deletion of an empty category reordered on the other side', () => {
    const base = [category('Docs', []), category('Other', [])];
    const current = [category('Other', [])];
    const other = [category('Other', []), category('Docs', [])];
    const result = mergeLinks(base, current, other);
    expect(result.conflicts.some((item) =>
      item.label === 'Delete versus change for category Docs'
    )).toBe(true);
  });

  it('merges independent field and category-placement changes', () => {
    const base = [category('Docs', [link('one', 'https://old.test', 'Old')])];
    const current = [category('Refs', [link('one', 'https://old.test', 'Old')])];
    const other = [category('Docs', [link('one', 'https://new.test', 'Old')])];
    const result = mergeLinks(base, current, other);
    expect(result.conflicts).toHaveLength(0);
    expect(result.categories).toEqual([
      category('Refs', [link('one', 'https://new.test', 'Old')])
    ]);
  });

  it('reports same-field divergence with a user-facing label', () => {
    const base = [category('Docs', [link('one', 'https://x.test', 'Base')])];
    const current = [category('Docs', [link('one', 'https://x.test', 'Current')])];
    const other = [category('Docs', [link('one', 'https://x.test', 'Other')])];
    const result = mergeLinks(base, current, other);
    expect(result.conflicts[0].label).toBe('Description for https://x.test');
    result.conflicts[0].resolution = 'Edited';
    expect(result.assemble(result.conflicts)[0].links[0].description).toBe('Edited');
  });

  it('reports edit-versus-delete, incompatible moves, and duplicate IDs', () => {
    const base = [category('Docs', [link('one', 'https://x.test', 'Base')])];
    const edited = [category('Refs', [link('one', 'https://x.test', 'Edited')])];
    const deletion = [];
    expect(mergeLinks(base, edited, deletion).conflicts[0].label).toContain('Delete versus edit');

    const movedCurrent = [category('A', [link('one', 'https://x.test', 'Base')])];
    const movedOther = [category('B', [link('one', 'https://x.test', 'Base')])];
    const moved = mergeLinks(base, movedCurrent, movedOther);
    expect(moved.conflicts.some((item) => item.label.startsWith('Category'))).toBe(true);
    expect(moved.assemble(moved.conflicts).map((item) => item.name)).toEqual(['A']);

    const duplicate = [category('Docs', [
      link('same', 'https://a.test', 'A'),
      link('same', 'https://b.test', 'B')
    ])];
    expect(mergeLinks([], duplicate, []).conflicts.some((item) => item.label.includes('Duplicate stable link ID'))).toBe(true);
  });
});
