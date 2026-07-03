import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadTodoContent, saveTodoContent, setupFileWatcher } from '../../src/api/todoApi.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadTodoContent', () => {
  it('returns content on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: 'hello' }) })));
    await expect(loadTodoContent()).resolves.toBe('hello');
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadTodoContent()).rejects.toThrow('Failed to load tasks');
  });
});

describe('saveTodoContent', () => {
  it('POSTs the content as JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await saveTodoContent('data');
    expect(fetchMock).toHaveBeenCalledWith('/api/todo', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: 'data' });
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(saveTodoContent('x')).rejects.toThrow('Failed to save tasks');
  });
});

describe('setupFileWatcher', () => {
  it('invokes the callback when a change event is received', () => {
    let instance;
    class FakeEventSource {
      constructor(url) {
        this.url = url;
        instance = this;
      }
      close() {
        this.closed = true;
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    const cb = vi.fn();
    const es = setupFileWatcher(cb);
    expect(es).toBe(instance);
    instance.onmessage({ data: JSON.stringify({ type: 'change' }) });
    expect(cb).toHaveBeenCalled();
  });
});
