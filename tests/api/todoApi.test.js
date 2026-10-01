import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTodoContent, saveTodoContent, setupFileWatcher } from '../../src/api/todoApi.js';
import { RECONNECT_DELAY_MS } from '../../src/constants.js';

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
  let instances;
  let watchers;

  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.closed = false;
      instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }

  const setHidden = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    instances = [];
    watchers = [];
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    vi.stubGlobal('EventSource', FakeEventSource);
  });

  // Each watcher registers a document listener, so leaked watchers from an
  // earlier test would also react to visibility changes in later ones.
  afterEach(() => {
    watchers.forEach(w => w.close());
  });

  const makeWatcher = (cb = vi.fn()) => {
    const watcher = setupFileWatcher(cb);
    watchers.push(watcher);
    return watcher;
  };

  const openStreams = () => instances.filter(i => !i.closed);

  it('invokes the callback when a change event is received', () => {
    const cb = vi.fn();
    makeWatcher(cb);
    instances[0].onmessage({ data: JSON.stringify({ type: 'change' }) });
    expect(cb).toHaveBeenCalled();
  });

  it('returns a handle that closes the stream', () => {
    const watcher = makeWatcher();
    expect(openStreams()).toHaveLength(1);
    watcher.close();
    expect(openStreams()).toHaveLength(0);
  });

  it('releases the connection while the tab is hidden and restores it', () => {
    const cb = vi.fn();
    makeWatcher(cb);
    expect(openStreams()).toHaveLength(1);

    // A hidden tab must not hold one of the origin's limited connection slots.
    setHidden(true);
    expect(openStreams()).toHaveLength(0);

    setHidden(false);
    expect(openStreams()).toHaveLength(1);
    // Resync so changes made while disconnected are not missed.
    expect(cb).toHaveBeenCalled();
  });

  it('does not reconnect after being closed', () => {
    const watcher = makeWatcher();
    watcher.close();
    setHidden(false);
    expect(openStreams()).toHaveLength(0);
  });

  it('releases the socket immediately when the stream errors', () => {
    vi.useFakeTimers();
    makeWatcher();
    instances[0].onerror(new Error('boom'));
    expect(openStreams()).toHaveLength(0);

    vi.advanceTimersByTime(RECONNECT_DELAY_MS);
    expect(openStreams()).toHaveLength(1);
    vi.useRealTimers();
  });
});
