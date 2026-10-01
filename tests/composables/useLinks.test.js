import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/linksApi.js', () => ({
  loadLinks: vi.fn(),
  saveLinks: vi.fn()
}));

import { loadLinks as apiLoadLinks, saveLinks as apiSaveLinks } from '../../src/api/linksApi.js';
import { ConflictError, RateLimitError, ResourceProtocolError } from '../../src/api/resourceErrors.js';
import { useLinks } from '../../src/composables/useLinks.js';
import { useConflictDialogQueue } from '../../src/composables/useConflictDialogQueue.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  apiLoadLinks.mockResolvedValue({ categories: [], rawContent: '[]', version: 'v1', invalid: false });
  let revision = 1;
  apiSaveLinks.mockImplementation(async (categories) => ({
    categories,
    rawContent: JSON.stringify(categories, null, 2),
    version: `v${++revision}`,
    invalid: false
  }));
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

  it('rejects invalid optimistic mutations and restores the previous Links state', async () => {
    const { categories, addLink, error } = useLinks();

    await expect(addLink({
      category: 'x'.repeat(101),
      url: 'https://invalid.test',
      description: 'Invalid category'
    })).rejects.toThrow('Every category needs a valid name');

    expect(categories.value).toEqual([]);
    expect(error.value).toContain('Every category needs a valid name');
    expect(apiSaveLinks).not.toHaveBeenCalled();
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
    apiLoadLinks.mockResolvedValue({
      categories: [
        { name: 'Docs', links: [{ url: 'https://a.com', description: 'a' }, { description: 'no url' }] },
        { name: '', links: [] },
        { notName: true }
      ],
      rawContent: '[]',
      version: 'v1',
      invalid: false
    });
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

  it('shows the actionable protocol message for outdated load responses and logs diagnostics', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new ResourceProtocolError(
      'Invalid links load response: content=undefined, version=undefined',
      'Restart the app server, then retry loading Links.',
      { operation: 'load', responseKeys: ['categories'] }
    );
    apiLoadLinks.mockRejectedValue(failure);
    const { error, loadLinks } = useLinks();

    try {
      await expect(loadLinks()).resolves.toBeNull();
      expect(error.value).toBe(failure.userMessage);
      expect(error.value).not.toContain('content=undefined');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading links:',
        expect.objectContaining({
          message: expect.stringContaining('content=undefined'),
          details: failure.details
        })
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('shows the actionable protocol message for outdated save responses and logs diagnostics', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new ResourceProtocolError(
      'Invalid links save response: content=undefined, version=undefined',
      'Restart the app server, then retry saving Links.',
      { operation: 'save', responseKeys: ['success'] }
    );
    apiSaveLinks.mockRejectedValue(failure);
    const links = useLinks();
    await links.loadLinks();

    try {
      await expect(links.saveLinks()).rejects.toBe(failure);
      expect(links.error.value).toBe(failure.userMessage);
      expect(links.error.value).not.toContain('content=undefined');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error saving links:',
        expect.objectContaining({
          message: expect.stringContaining('content=undefined'),
          details: failure.details
        })
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('automatically merges independent additions from stale Links tabs', async () => {
    const remote = {
      name: 'Docs',
      links: [{ id: 'remote', url: 'https://remote.test', description: 'Remote' }]
    };
    apiSaveLinks
      .mockRejectedValueOnce(new ConflictError('stale', {
        categories: [remote],
        rawContent: JSON.stringify([remote]),
        version: 'v2',
        invalid: false
      }))
      .mockImplementationOnce(async (categories) => ({
        categories,
        rawContent: JSON.stringify(categories),
        version: 'v3',
        invalid: false
      }));
    const links = useLinks();
    await links.loadLinks();
    await links.addLink({ category: 'Docs', url: 'https://current.test', description: 'Current' });
    expect(apiSaveLinks).toHaveBeenCalledTimes(2);
    expect(links.categories.value[0].links.map((item) => item.id)).toEqual(
      expect.arrayContaining(['remote', expect.any(String)])
    );
  });

  it('keeps a clean merged retry failure visible and includes it in the next edit', async () => {
    const remote = {
      name: 'Docs',
      links: [{ id: 'remote', url: 'https://remote.test', description: 'Remote' }]
    };
    apiSaveLinks
      .mockRejectedValueOnce(new ConflictError('stale', {
        categories: [remote],
        rawContent: JSON.stringify([remote]),
        version: 'v2',
        invalid: false
      }))
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async (categories) => ({
        categories,
        rawContent: JSON.stringify(categories),
        version: 'v3',
        invalid: false
      }));
    const links = useLinks();
    await links.loadLinks();

    await expect(links.addLink({
      category: 'Docs',
      url: 'https://current.test',
      description: 'Current'
    })).rejects.toThrow('offline');

    expect(links.categories.value[0].links.map((item) => item.id)).toEqual(
      expect.arrayContaining(['remote', expect.any(String)])
    );
    expect(links.dirty.value).toBe(true);

    await links.addLink({
      category: 'Docs',
      url: 'https://next.test',
      description: 'Next'
    });

    expect(apiSaveLinks.mock.calls.at(-1)[0][0].links.map((item) => item.id))
      .toEqual(expect.arrayContaining(['remote', expect.any(String), expect.any(String)]));
    expect(apiSaveLinks.mock.calls.at(-1)[1]).toBe('v2');
  });

  it('opens a field-specific dialog for same-field divergence', async () => {
    const base = [{
      name: 'Docs',
      links: [{ id: 'one', url: 'https://x.test', description: 'Base' }]
    }];
    apiLoadLinks.mockResolvedValue({
      categories: base,
      rawContent: JSON.stringify(base),
      version: 'v1',
      invalid: false
    });
    apiSaveLinks.mockRejectedValueOnce(new ConflictError('stale', {
      categories: [{
        name: 'Docs',
        links: [{ id: 'one', url: 'https://x.test', description: 'Other' }]
      }],
      rawContent: '[]',
      version: 'v2',
      invalid: false
    }));
    const links = useLinks();
    await links.loadLinks();
    await links.updateLink('one', 'Docs', {
      category: 'Docs',
      url: 'https://x.test',
      description: 'Current'
    });
    const active = useConflictDialogQueue().activeConflict.value;
    expect(active.conflicts[0].label).toBe('Description for https://x.test');
    active.cancel(active.conflicts);
  });

  it('recovers invalid raw JSON with generated stable link IDs', async () => {
    apiLoadLinks.mockResolvedValue({
      categories: null,
      rawContent: '{"broken"',
      version: 'v-bad',
      invalid: true
    });
    const links = useLinks();
    await links.loadLinks();

    await links.replaceInvalidRaw(JSON.stringify([{
      name: 'Recovered',
      links: [{ url: 'https://recovered.test', description: 'Recovered' }]
    }]));

    expect(apiSaveLinks).toHaveBeenCalledWith([
      {
        name: 'Recovered',
        links: [expect.objectContaining({
          id: expect.any(String),
          url: 'https://recovered.test'
        })]
      }
    ], 'v-bad', { replaceInvalid: true });
  });

  it('recovers valid JSON entered while resolving an invalid external file', async () => {
    const base = [{
      name: 'Docs',
      links: [{ id: 'one', url: 'https://base.test', description: 'Base' }]
    }];
    apiLoadLinks.mockResolvedValue({
      categories: base,
      rawContent: JSON.stringify(base),
      version: 'v1',
      invalid: false
    });
    apiSaveLinks
      .mockRejectedValueOnce(new ConflictError('stale', {
        categories: null,
        rawContent: '{"broken"',
        version: 'v2',
        invalid: true
      }))
      .mockImplementationOnce(async (categories) => ({
        categories,
        rawContent: JSON.stringify(categories),
        version: 'v3',
        invalid: false
      }));
    const links = useLinks();
    await links.loadLinks();
    await links.updateLink('one', 'Docs', {
      category: 'Docs',
      url: 'https://base.test',
      description: 'Current'
    });

    const active = useConflictDialogQueue().activeConflict.value;
    active.conflicts[0].resolution = JSON.stringify([{
      name: 'Recovered',
      links: [{ url: 'https://external.test', description: 'External recovery' }]
    }]);
    active.conflicts[0].resolved = true;
    await active.apply(active.conflicts);
    expect(apiSaveLinks).toHaveBeenCalledTimes(1);
    await active.apply(active.conflicts, { replacementConfirmed: true });

    expect(apiSaveLinks).toHaveBeenLastCalledWith([
      {
        name: 'Recovered',
        links: [expect.objectContaining({
          id: expect.any(String),
          url: 'https://external.test'
        })]
      }
    ], 'v2', { replaceInvalid: true });
    expect(links.categories.value[0].links[0].id).toEqual(expect.any(String));
  });

  it('keeps valid local changes after explicit invalid-file replacement and uses the accepted version next', async () => {
    const base = [{
      name: 'Docs',
      links: [{ id: 'one', url: 'https://base.test', description: 'Base' }]
    }];
    apiLoadLinks.mockResolvedValue({
      categories: base,
      rawContent: JSON.stringify(base),
      version: 'v1',
      invalid: false
    });
    apiSaveLinks
      .mockRejectedValueOnce(new ConflictError('stale', {
        categories: null,
        rawContent: '{"broken"',
        version: 'v2',
        invalid: true
      }))
      .mockImplementationOnce(async (categories) => ({
        categories: categories.map((category) => ({
          ...category,
          links: category.links.map((link) => ({ ...link, description: 'Accepted current' }))
        })),
        rawContent: '[]',
        version: 'v3',
        invalid: false
      }))
      .mockImplementationOnce(async (categories) => ({
        categories,
        rawContent: '[]',
        version: 'v4',
        invalid: false
      }));
    const links = useLinks();
    await links.loadLinks();
    await links.updateLink('one', 'Docs', {
      category: 'Docs',
      url: 'https://base.test',
      description: 'Current'
    });

    const active = useConflictDialogQueue().activeConflict.value;
    await active.apply(active.conflicts);
    expect(apiSaveLinks).toHaveBeenCalledTimes(1);
    await active.apply(active.conflicts, { replacementConfirmed: true });
    expect(apiSaveLinks).toHaveBeenLastCalledWith(
      expect.any(Array),
      'v2',
      { replaceInvalid: true }
    );
    expect(links.categories.value[0].links[0].description).toBe('Accepted current');

    await links.updateLink('one', 'Docs', {
      category: 'Docs',
      url: 'https://base.test',
      description: 'Next'
    });
    expect(apiSaveLinks.mock.calls.at(-1)[1]).toBe('v3');
    expect(apiSaveLinks.mock.calls.at(-1)[0][0].links[0].description).toBe('Next');
  });

  it('keeps a resolved candidate through exhausted rate-limit retries and saves it on retry', async () => {
    const base = [{
      name: 'Docs',
      links: [{ id: 'one', url: 'https://x.test', description: 'Base' }]
    }];
    apiLoadLinks.mockResolvedValue({
      categories: base,
      rawContent: JSON.stringify(base),
      version: 'v1',
      invalid: false
    });
    apiSaveLinks
      .mockRejectedValueOnce(new ConflictError('stale', {
        categories: [{
          name: 'Docs',
          links: [{ id: 'one', url: 'https://x.test', description: 'Other' }]
        }],
        rawContent: '[]',
        version: 'v2',
        invalid: false
      }))
      .mockRejectedValueOnce(new RateLimitError('Slow down'))
      .mockRejectedValueOnce(new RateLimitError('Slow down'))
      .mockRejectedValueOnce(new RateLimitError('Slow down'))
      .mockImplementationOnce(async (categories) => ({
        categories,
        rawContent: JSON.stringify(categories),
        version: 'v3',
        invalid: false
      }));
    const links = useLinks();
    await links.loadLinks();
    await links.updateLink('one', 'Docs', {
      category: 'Docs',
      url: 'https://x.test',
      description: 'Current'
    });

    const active = useConflictDialogQueue().activeConflict.value;
    active.conflicts[0].resolution = 'Resolved';
    active.conflicts[0].resolved = true;
    await expect(active.apply(active.conflicts)).rejects.toThrow('Slow down');

    expect(links.categories.value[0].links[0].description).toBe('Resolved');
    expect(links.dirty.value).toBe(true);

    await links.saveLinks();
    expect(apiSaveLinks.mock.calls.at(-1)[0][0].links[0].description).toBe('Resolved');
    expect(apiSaveLinks.mock.calls.at(-1)[1]).toBe('v2');
  });

  it('restores a failed optimistic link add before retrying without duplicates', async () => {
    const links = useLinks();
    apiSaveLinks.mockRejectedValueOnce(new Error('offline'));

    await expect(links.addLink({
      category: 'Docs',
      url: 'https://retry.test',
      description: 'Retry'
    })).rejects.toThrow('offline');
    expect(links.categories.value).toEqual([]);
    expect(links.dirty.value).toBe(false);

    await links.addLink({
      category: 'Docs',
      url: 'https://retry.test',
      description: 'Retry'
    });
    expect(links.categories.value[0].links).toHaveLength(1);
    expect(apiSaveLinks.mock.calls.at(-1)[0][0].links).toHaveLength(1);
  });

  it('serializes overlapping link actions and preserves both changes', async () => {
    const firstSave = deferred();
    const secondSave = deferred();
    apiSaveLinks
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const links = useLinks();
    await links.loadLinks();

    const firstAction = links.addLink({
      category: 'Docs',
      url: 'https://first.test',
      description: 'First'
    });
    await vi.waitFor(() => expect(apiSaveLinks).toHaveBeenCalledTimes(1));
    const secondAction = links.addLink({
      category: 'Docs',
      url: 'https://second.test',
      description: 'Second'
    });
    expect(apiSaveLinks).toHaveBeenCalledTimes(1);

    const firstCategories = apiSaveLinks.mock.calls[0][0];
    firstSave.resolve({
      categories: firstCategories,
      rawContent: JSON.stringify(firstCategories),
      version: 'v2',
      invalid: false
    });
    await firstAction;
    await vi.waitFor(() => expect(apiSaveLinks).toHaveBeenCalledTimes(2));
    expect(apiSaveLinks.mock.calls[1][1]).toBe('v2');

    const secondCategories = apiSaveLinks.mock.calls[1][0];
    secondSave.resolve({
      categories: secondCategories,
      rawContent: JSON.stringify(secondCategories),
      version: 'v3',
      invalid: false
    });
    await secondAction;

    expect(links.categories.value[0].links.map((link) => link.url)).toEqual([
      'https://second.test',
      'https://first.test'
    ]);
    expect(links.version.value).toBe('v3');
    expect(links.dirty.value).toBe(false);
  });
});
