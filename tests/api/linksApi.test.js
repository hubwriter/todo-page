import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLinks, saveLinks } from '../../src/api/linksApi.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadLinks', () => {
  it('returns categories on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ categories: [{ name: 'X', links: [] }] }) }))
    );
    await expect(loadLinks()).resolves.toEqual([{ name: 'X', links: [] }]);
  });

  it('returns an empty array when categories are missing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    await expect(loadLinks()).resolves.toEqual([]);
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadLinks()).rejects.toThrow('Failed to load links');
  });
});

describe('saveLinks', () => {
  it('POSTs the categories as JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await saveLinks([{ name: 'X', links: [] }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ categories: [{ name: 'X', links: [] }] });
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(saveLinks([])).rejects.toThrow('Failed to save links');
  });
});
