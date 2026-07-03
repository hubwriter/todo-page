import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/linksApi.js', () => ({
  loadLinks: vi.fn(() => Promise.resolve([])),
  saveLinks: vi.fn(() => Promise.resolve())
}));

import { loadLinks as apiLoadLinks, saveLinks as apiSaveLinks } from '../../src/api/linksApi.js';
import { useLinks } from '../../src/composables/useLinks.js';

beforeEach(() => {
  vi.clearAllMocks();
  apiLoadLinks.mockResolvedValue([]);
  apiSaveLinks.mockResolvedValue(undefined);
});

describe('useLinks', () => {
  it('categoryNames always includes the default GitHub category', () => {
    const { categoryNames } = useLinks();
    expect(categoryNames.value).toContain('GitHub');
  });

  it('addLink creates a new category and saves', async () => {
    const { categories, addLink } = useLinks();
    await addLink({ category: 'Docs', url: 'https://vuejs.org', description: 'Vue' });
    expect(categories.value).toHaveLength(1);
    expect(categories.value[0].name).toBe('Docs');
    expect(categories.value[0].links[0]).toMatchObject({ url: 'https://vuejs.org', description: 'Vue' });
    expect(apiSaveLinks).toHaveBeenCalled();
  });

  it('addLink prepends to an existing category', async () => {
    const { categories, addLink } = useLinks();
    await addLink({ category: 'Docs', url: 'https://a.com', description: 'a' });
    await addLink({ category: 'Docs', url: 'https://b.com', description: 'b' });
    expect(categories.value).toHaveLength(1);
    expect(categories.value[0].links.map((l) => l.url)).toEqual(['https://b.com', 'https://a.com']);
  });

  it('categoryNames reflects added categories', async () => {
    const { categoryNames, addLink } = useLinks();
    await addLink({ category: 'Docs', url: 'https://a.com', description: 'a' });
    expect(categoryNames.value).toEqual(expect.arrayContaining(['GitHub', 'Docs']));
  });

  it('deleteLink removes an entry and prunes empty categories', async () => {
    const { categories, addLink, deleteLink } = useLinks();
    await addLink({ category: 'Docs', url: 'https://a.com', description: 'a' });
    const id = categories.value[0].links[0].id;
    await deleteLink('Docs', id);
    expect(categories.value).toHaveLength(0);
  });

  it('updateLink can move an entry to a new category', async () => {
    const { categories, addLink, updateLink } = useLinks();
    await addLink({ category: 'Docs', url: 'https://a.com', description: 'a' });
    const id = categories.value[0].links[0].id;
    await updateLink(id, 'Docs', { category: 'Refs', url: 'https://a.com', description: 'updated' });
    expect(categories.value.find((c) => c.name === 'Docs')).toBeUndefined();
    const refs = categories.value.find((c) => c.name === 'Refs');
    expect(refs.links[0].description).toBe('updated');
  });

  it('moveLink moves entries between categories and prunes empties', async () => {
    const { categories, addLink, moveLink } = useLinks();
    await addLink({ category: 'A', url: 'https://a.com', description: 'a' });
    await addLink({ category: 'B', url: 'https://b.com', description: 'b' });
    const catA = categories.value.find((c) => c.name === 'A');
    const id = catA.links[0].id;
    await moveLink('A', id, 'B', 0);
    expect(categories.value.find((c) => c.name === 'A')).toBeUndefined();
    const catB = categories.value.find((c) => c.name === 'B');
    expect(catB.links.map((l) => l.url)).toContain('https://a.com');
  });

  it('loadLinks normalizes server data (drops invalid links, generates ids)', async () => {
    apiLoadLinks.mockResolvedValue([
      { name: 'Docs', links: [{ url: 'https://a.com', description: 'a' }, { description: 'no url' }] },
      { name: '', links: [] },
      { notName: true }
    ]);
    const { categories, loadLinks } = useLinks();
    await loadLinks();
    expect(categories.value).toHaveLength(1);
    expect(categories.value[0].name).toBe('Docs');
    expect(categories.value[0].links).toHaveLength(1);
    expect(categories.value[0].links[0].id).toBeTruthy();
  });

  it('surfaces load errors without throwing', async () => {
    apiLoadLinks.mockRejectedValue(new Error('kaboom'));
    const { error, loadLinks } = useLinks();
    const result = await loadLinks();
    expect(result).toBeNull();
    expect(error.value).toContain('kaboom');
  });
});
