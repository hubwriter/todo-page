import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

describe('concurrency API', () => {
  let dir;
  let todoPath;
  let linksPath;
  let child;
  let baseUrl;

  beforeAll(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'todo-api-concurrency-'));
    todoPath = join(dir, 'todo.md');
    linksPath = join(dir, 'links.json');
    await fs.writeFile(todoPath, '# Priority\n\n# Other\n\n# Done\n', 'utf-8');
    await fs.writeFile(linksPath, '[]', 'utf-8');
    const port = 42000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        TODO_FILE_PATH: todoPath,
        LINKS_FILE_PATH: linksPath
      },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/api/todo`);
        if (response.ok) return;
      } catch {
        // Wait for the server to bind.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Test server did not start');
  });

  afterAll(async () => {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns 428 for a blind write and 409 latest state for a stale write', async () => {
    const missing = await fetch(`${baseUrl}/api/todo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'blind' })
    });
    expect(missing.status).toBe(428);

    const loaded = await fetch(`${baseUrl}/api/todo`).then((response) => response.json());
    await fs.writeFile(todoPath, 'external edit', 'utf-8');
    const stale = await fetch(`${baseUrl}/api/todo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'stale tab', baseVersion: loaded.version })
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ content: 'external edit' });
    expect(await fs.readFile(todoPath, 'utf-8')).toBe('external edit');
  });

  it('returns the latest links state for a stale write without overwriting it', async () => {
    const loaded = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    const external = [{
      name: 'External',
      links: [{ id: 'external', url: 'https://external.test', description: 'External' }]
    }];
    await fs.writeFile(linksPath, JSON.stringify(external), 'utf-8');

    const stale = await fetch(`${baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: [{
          name: 'Stale',
          links: [{ id: 'stale', url: 'https://stale.test', description: 'Stale' }]
        }],
        baseVersion: loaded.version
      })
    });

    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      categories: external,
      invalid: false
    });
    expect(JSON.parse(await fs.readFile(linksPath, 'utf-8'))).toEqual(external);
  });

  it('serializes two requests with the same base and backs up the replaced content', async () => {
    const loaded = await fetch(`${baseUrl}/api/todo`).then((response) => response.json());
    const responses = await Promise.all(['one', 'two'].map((content) => fetch(`${baseUrl}/api/todo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, baseVersion: loaded.version })
    })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith('todo-backup-'));
    expect(backups.length).toBeGreaterThan(0);
    expect(await fs.readFile(join(dir, backups.at(-1)), 'utf-8')).toBe('external edit');
  });

  it('exposes invalid links JSON and requires explicit conditional replacement', async () => {
    await fs.writeFile(linksPath, '{"broken"', 'utf-8');
    const invalid = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    expect(invalid).toMatchObject({ invalid: true, categories: null, rawContent: '{"broken"' });

    const ordinary = await fetch(`${baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: [], baseVersion: invalid.version })
    });
    expect(ordinary.status).toBe(422);
    expect(await fs.readFile(linksPath, 'utf-8')).toBe('{"broken"');

    const replacement = await fetch(`${baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categories: [], baseVersion: invalid.version, replaceInvalid: true })
    });
    expect(replacement.status).toBe(200);
    expect(await fs.readFile(linksPath, 'utf-8')).toBe('[]');
    const backups = (await fs.readdir(dir)).filter((name) => name.startsWith('links-backup-'));
    expect(backups.length).toBeGreaterThan(0);
    expect(await fs.readFile(join(dir, backups.at(-1)), 'utf-8')).toBe('{"broken"');
  });

  it('migrates legacy links to durable IDs that survive content and ordering changes', async () => {
    await fs.writeFile(linksPath, JSON.stringify([{
      name: 'Docs',
      links: [
        { url: 'https://example.test', description: 'Example' },
        { url: 'https://second.test', description: 'Second' }
      ]
    }]), 'utf-8');
    const first = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    const stableId = first.categories[0].links[0].id;
    expect(stableId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(await fs.readFile(linksPath, 'utf-8'))[0].links[0].id).toBe(stableId);

    const changed = first.categories;
    changed[0].links[0].description = 'Externally edited description';
    changed[0].links[0].url = 'https://changed.test';
    changed.push({ name: 'Moved', links: [changed[0].links.shift()] });
    changed[0].links.reverse();
    await fs.writeFile(linksPath, JSON.stringify(changed), 'utf-8');

    const second = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    const migrated = second.categories
      .flatMap((category) => category.links)
      .find((link) => link.id === stableId);
    expect(migrated).toMatchObject({
      id: stableId,
      url: 'https://changed.test',
      description: 'Externally edited description'
    });
  });

  it('persists legacy IDs before returning a stale-write conflict', async () => {
    const loaded = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    const legacy = [{
      name: 'Legacy',
      links: [{ url: 'https://legacy.test', description: 'Legacy' }]
    }];
    await fs.writeFile(linksPath, JSON.stringify(legacy), 'utf-8');

    const response = await fetch(`${baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: loaded.categories,
        baseVersion: loaded.version
      })
    });

    expect(response.status).toBe(409);
    const conflict = await response.json();
    const durableId = conflict.categories[0].links[0].id;
    expect(durableId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(JSON.parse(await fs.readFile(linksPath, 'utf-8'))[0].links[0].id).toBe(durableId);
  });

});

describe('backup failure API', () => {
  let dir;
  let todoPath;
  let linksPath;
  let child;
  let baseUrl;

  beforeAll(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'todo-api-backup-failure-'));
    todoPath = join(dir, 'todo.md');
    linksPath = join(dir, 'links.json');
    const preloadPath = join(dir, 'fail-backups.mjs');
    await fs.writeFile(todoPath, 'todo before failed backup', 'utf-8');
    await fs.writeFile(linksPath, JSON.stringify([{
      name: 'Docs',
      links: [{ id: 'one', url: 'https://before.test', description: 'Before' }]
    }]), 'utf-8');
    await fs.writeFile(preloadPath, `
      import fs from 'node:fs/promises';
      const writeFile = fs.writeFile.bind(fs);
      fs.writeFile = async (path, ...args) => {
        if (String(path).includes('-backup-')) {
          const error = new Error('Injected backup failure');
          error.code = 'EACCES';
          throw error;
        }
        return writeFile(path, ...args);
      };
    `, 'utf-8');

    const port = 43000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--import', preloadPath, 'server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        TODO_FILE_PATH: todoPath,
        LINKS_FILE_PATH: linksPath
      },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/api/todo`);
        if (response.ok) return;
      } catch {
        // Wait for the server to bind.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Backup-failure test server did not start');
  });

  afterAll(async () => {
    child?.kill('SIGTERM');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns an explicit failure and preserves todo content when backup creation fails', async () => {
    const loaded = await fetch(`${baseUrl}/api/todo`).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/todo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'todo replacement', baseVersion: loaded.version })
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to create todo backup' });
    expect(await fs.readFile(todoPath, 'utf-8')).toBe('todo before failed backup');
  });

  it('returns an explicit failure and preserves links content when backup creation fails', async () => {
    const original = await fs.readFile(linksPath, 'utf-8');
    const loaded = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categories: [{
          name: 'Docs',
          links: [{ id: 'one', url: 'https://after.test', description: 'After' }]
        }],
        baseVersion: loaded.version
      })
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Failed to create links backup' });
    expect(await fs.readFile(linksPath, 'utf-8')).toBe(original);
  });
});

describe('configured todo symlink API', () => {
  let rootDir;
  let configuredDir;
  let targetDir;
  let todoLinkPath;
  let todoTargetPath;
  let child;
  let baseUrl;

  beforeAll(async () => {
    rootDir = await fs.mkdtemp(join(os.tmpdir(), 'todo-api-symlink-'));
    configuredDir = join(rootDir, 'configured');
    targetDir = join(rootDir, 'target');
    await fs.mkdir(configuredDir);
    await fs.mkdir(targetDir);
    todoLinkPath = join(configuredDir, 'todo.md');
    todoTargetPath = join(targetDir, 'todo.md');
    await fs.writeFile(todoTargetPath, '# Priority\n\n- [ ] Original\n\n# Other\n\n# Done\n', 'utf-8');
    await fs.symlink(todoTargetPath, todoLinkPath);
    await fs.writeFile(join(configuredDir, 'links.json'), JSON.stringify([{
      name: 'Configured links',
      links: [{ id: 'configured', url: 'https://configured.test', description: 'Configured' }]
    }]), 'utf-8');

    const port = 44000 + Math.floor(Math.random() * 1000);
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        TODO_FILE_PATH: todoLinkPath,
        LINKS_FILE_PATH: ''
      },
      stdio: 'ignore'
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/api/todo`);
        if (response.ok) return;
      } catch {
        // Wait for the server to bind.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Symlink test server did not start');
  });

  afterAll(async () => {
    child?.kill('SIGTERM');
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('keeps companion links and backups beside the configured symlink', async () => {
    const links = await fetch(`${baseUrl}/api/links`).then((response) => response.json());
    expect(links.categories[0].name).toBe('Configured links');
    await expect(fs.stat(join(targetDir, 'links.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    const loaded = await fetch(`${baseUrl}/api/todo`).then((response) => response.json());
    const replacement = '# Priority\n\n- [ ] Replacement\n\n# Other\n\n# Done\n';
    const response = await fetch(`${baseUrl}/api/todo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: replacement, baseVersion: loaded.version })
    });
    expect(response.status).toBe(200);
    expect(await fs.readlink(todoLinkPath)).toBe(todoTargetPath);
    expect(await fs.readFile(todoTargetPath, 'utf-8')).toBe(replacement);

    const configuredEntries = await fs.readdir(configuredDir);
    expect(configuredEntries.some((name) => name.startsWith('todo-backup-'))).toBe(true);
    const targetEntries = await fs.readdir(targetDir);
    expect(targetEntries.some((name) => name.startsWith('todo-backup-'))).toBe(false);
  });
});
