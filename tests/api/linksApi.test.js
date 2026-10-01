import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadLinks, saveLinks } from '../../src/api/linksApi.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadLinks', () => {
  it('returns categories on success', async () => {
    const payload = { categories: [{ name: 'X', links: [] }], rawContent: '[]', version: 'v1', invalid: false };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })));
    await expect(loadLinks()).resolves.toEqual(payload);
  });

  it('returns invalid-content state unchanged', async () => {
    const payload = { categories: null, rawContent: '{', version: 'v1', invalid: true };
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })));
    await expect(loadLinks()).resolves.toEqual(payload);
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadLinks()).rejects.toThrow('Failed to load links');
  });

  it('rejects an outdated response without content or version', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ categories: [] })
    })));
    const error = await loadLinks().catch((failure) => failure);
    expect(error.message).toBe('Invalid links load response: content=undefined, version=undefined');
    expect(error.userMessage).toContain('Restart the app server');
    expect(error.details).toMatchObject({
      operation: 'load',
      contentType: 'undefined',
      versionType: 'undefined'
    });
  });
});

describe('saveLinks', () => {
  it('POSTs the categories as JSON', async () => {
    const payload = { categories: [{ name: 'X', links: [] }], rawContent: '[]', version: 'v2', invalid: false };
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }));
    vi.stubGlobal('fetch', fetchMock);
    await saveLinks([{ name: 'X', links: [] }], 'v1');
    expect(fetchMock).toHaveBeenCalledWith('/api/links', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      categories: [{ name: 'X', links: [] }],
      baseVersion: 'v1',
      replaceInvalid: false
    });
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(saveLinks([])).rejects.toThrow('Failed to save links');
  });

  it('rejects the legacy success-only save response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true })
    })));
    const error = await saveLinks([], 'v1').catch((failure) => failure);
    expect(error.message).toBe('Invalid links save response: content=undefined, version=undefined');
    expect(error.userMessage).toContain('Restart the app server');
    expect(error.details.responseKeys).toEqual(['success']);
  });
});
