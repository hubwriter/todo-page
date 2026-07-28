import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadBackups, loadBackupContent } from '../../src/api/backupsApi.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadBackups', () => {
  it('requests the backups endpoint and returns the array', async () => {
    const backups = [
      { filename: 'todo-backup-20260728T120000.md', timestamp: '2026-07-28T12:00:00.000Z' }
    ];
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ backups }) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBackups()).resolves.toEqual(backups);
    expect(fetchMock).toHaveBeenCalledWith('/api/backups');
  });

  it('returns an empty array when the payload has no backups array', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })));
    await expect(loadBackups()).resolves.toEqual([]);
  });

  it('returns an empty array when backups is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ backups: null }) })));
    await expect(loadBackups()).resolves.toEqual([]);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadBackups()).rejects.toThrow('Failed to load backups');
  });
});

describe('loadBackupContent', () => {
  it('requests the single backup endpoint and returns its content', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: '# Priority\n' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBackupContent('todo-backup-20260728T120000.md')).resolves.toBe('# Priority\n');
    expect(fetchMock).toHaveBeenCalledWith('/api/backups/todo-backup-20260728T120000.md');
  });

  it('URL-encodes the filename', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: 'x' }) }));
    vi.stubGlobal('fetch', fetchMock);

    await loadBackupContent('weird name/../x.md');
    expect(fetchMock).toHaveBeenCalledWith(`/api/backups/${encodeURIComponent('weird name/../x.md')}`);
  });

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadBackupContent('todo-backup-20260728T120000.md')).rejects.toThrow('Failed to load backup');
  });
});
