import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTodoContent, saveTodoContent, setupFileWatcher } from '../../src/api/todoApi.js';
import { RECONNECT_DELAY_MS } from '../../src/constants.js';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('loadTodoContent', () => {
  it('returns content on success', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ content: 'hello', version: 'v1' }) })));
    await expect(loadTodoContent()).resolves.toEqual({ content: 'hello', version: 'v1' });
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(loadTodoContent()).rejects.toThrow('Failed to load tasks');
  });

  it('rejects an outdated unversioned response with an actionable message', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: 'legacy content' })
    })));
    const error = await loadTodoContent().catch((failure) => failure);
    expect(error.message).toContain('version=undefined');
    expect(error.userMessage).toContain('Restart the app server');
    expect(error.details).toMatchObject({
      operation: 'load',
      contentType: 'string',
      versionType: 'undefined'
    });
  });
});

describe('saveTodoContent', () => {
  it('POSTs the content as JSON', async () => {
    const fetchMock = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ content: 'data', version: 'v2' })
    }));
    vi.stubGlobal('fetch', fetchMock);
    await saveTodoContent('data', 'v1');
    expect(fetchMock).toHaveBeenCalledWith('/api/todo', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ content: 'data', baseVersion: 'v1' });
  });

  it('throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    await expect(saveTodoContent('x')).rejects.toThrow('Failed to save tasks');
  });

  it('rejects the legacy success-only save response before it reaches Markdown parsing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true })
    })));
    const error = await saveTodoContent('edited task', 'v1').catch((failure) => failure);
    expect(error.message).toBe('Invalid todo save response: content=undefined, version=undefined');
    expect(error.userMessage).toContain('Restart the app server');
    expect(error.details.responseKeys).toEqual(['success']);
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
    instances[0].onmessage({ data: JSON.stringify({ resource: 'todo', version: 'v2' }) });
    expect(cb).toHaveBeenCalledWith({ resource: 'todo', version: 'v2' });
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

  it('resyncs exactly once after an outage reconnect and closes cleanly', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const watcher = makeWatcher(cb);
    const failedSource = instances[0];

    failedSource.onerror(new Error('boom'));
    expect(openStreams()).toHaveLength(0);
    expect(cb).not.toHaveBeenCalled();

    // The remote resource changes during the connection gap, with no SSE
    // event available to announce it.
    vi.advanceTimersByTime(RECONNECT_DELAY_MS);
    const reconnectedSource = instances[1];
    expect(openStreams()).toEqual([reconnectedSource]);

    reconnectedSource.onopen();
    reconnectedSource.onopen();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ resource: null, version: null, resync: true });

    failedSource.onerror(new Error('stale error'));
    vi.advanceTimersByTime(RECONNECT_DELAY_MS);
    expect(openStreams()).toEqual([reconnectedSource]);
    expect(cb).toHaveBeenCalledTimes(1);

    watcher.close();
    expect(openStreams()).toHaveLength(0);
    vi.advanceTimersByTime(RECONNECT_DELAY_MS);
    expect(openStreams()).toHaveLength(0);
    expect(cb).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
