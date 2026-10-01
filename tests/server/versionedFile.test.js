import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import {
  conditionalAtomicWrite,
  ensureVersionedFileExists,
  hashBytes,
  readVersionedFile,
  resolveVersionedFilePath
} from '../../server/versionedFile.js';

describe('versioned file writes', () => {
  let dir;
  let filePath;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'todo-versioned-'));
    filePath = join(dir, 'todo.md');
    await fs.writeFile(filePath, Buffer.from('first\r\n', 'utf-8'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('hashes the exact raw bytes on disk', async () => {
    const loaded = await readVersionedFile(filePath);
    expect(loaded.version).toBe(hashBytes(Buffer.from('first\r\n', 'utf-8')));
    expect(loaded.version).not.toBe(hashBytes(Buffer.from('first\n', 'utf-8')));
  });

  it.each([
    ['todo', 'todo.md', 'default todo'],
    ['links', 'links.json', '[]']
  ])('creates the default %s file when it is missing', async (resource, fileName, defaultContent) => {
    const missingPath = join(dir, fileName);
    await fs.unlink(missingPath).catch(() => {});

    await expect(ensureVersionedFileExists({
      resource: `${resource}-initialization-test`,
      filePath: missingPath,
      defaultContent
    })).resolves.toEqual({ created: true });
    expect(await fs.readFile(missingPath, 'utf-8')).toBe(defaultContent);
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each([
    ['todo', 'todo.md', 'default todo', 'external todo'],
    ['links', 'links.json', '[]', '{"external":true}']
  ])('never overwrites a %s file created immediately before publication', async (
    resource,
    fileName,
    defaultContent,
    externalContent
  ) => {
    const missingPath = join(dir, fileName);
    await fs.unlink(missingPath).catch(() => {});

    await expect(ensureVersionedFileExists({
      resource: `${resource}-initialization-race-test`,
      filePath: missingPath,
      defaultContent,
      beforePublish: async () => {
        await expect(fs.readFile(missingPath, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' });
        await fs.writeFile(missingPath, externalContent, 'utf-8');
      }
    })).resolves.toEqual({ created: false });
    expect(await fs.readFile(missingPath, 'utf-8')).toBe(externalContent);
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('allows only one of two concurrent writes from the same base version', async () => {
    const { version } = await readVersionedFile(filePath);
    const results = await Promise.all([
      conditionalAtomicWrite({ resource: 'todo-test', filePath, baseVersion: version, content: 'one' }),
      conditionalAtomicWrite({ resource: 'todo-test', filePath, baseVersion: version, content: 'two' })
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'written']);
    expect(['one', 'two']).toContain(await fs.readFile(filePath, 'utf-8'));
  });

  it('recreates a deleted file and returns a mergeable conflict', async () => {
    const { version } = await readVersionedFile(filePath);
    await fs.unlink(filePath);

    const result = await conditionalAtomicWrite({
      resource: 'todo-missing-test',
      filePath,
      baseVersion: version,
      content: 'local edit',
      missingContent: 'default content'
    });

    expect(result.status).toBe('conflict');
    expect(result.latest.content).toBe('default content');
    expect(await fs.readFile(filePath, 'utf-8')).toBe('default content');
  });

  it('does not expose the temporary content before the atomic rename', async () => {
    const { version } = await readVersionedFile(filePath);
    let observed;
    const result = await conditionalAtomicWrite({
      resource: 'todo-test',
      filePath,
      baseVersion: version,
      content: 'replacement',
      beforeRename: async () => {
        observed = await fs.readFile(filePath, 'utf-8');
      }
    });
    expect(observed).toBe('first\r\n');
    expect(result.status).toBe('written');
    expect(await fs.readFile(filePath, 'utf-8')).toBe('replacement');
  });

  it.each(['todo', 'links'])('preserves 0600 permissions when replacing the %s file', async (resource) => {
    await fs.chmod(filePath, 0o600);
    const { version } = await readVersionedFile(filePath);
    const result = await conditionalAtomicWrite({
      resource: `${resource}-mode-test`,
      filePath,
      baseVersion: version,
      content: 'replacement'
    });

    expect(result.status).toBe('written');
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
  });

  it('resolves an existing configured symlink and writes its target without replacing the link', async () => {
    const targetPath = join(dir, 'target.md');
    const linkPath = join(dir, 'configured.md');
    await fs.writeFile(targetPath, 'target', 'utf-8');
    await fs.symlink(targetPath, linkPath);

    const resolvedPath = await resolveVersionedFilePath(linkPath, 'todo');
    const { version } = await readVersionedFile(resolvedPath);
    await conditionalAtomicWrite({
      resource: 'todo-symlink-test',
      filePath: resolvedPath,
      baseVersion: version,
      content: 'replacement'
    });

    expect(resolvedPath).toBe(await fs.realpath(targetPath));
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(targetPath, 'utf-8')).toBe('replacement');
  });

  it('rejects a dangling configured symlink with a clear startup error', async () => {
    const linkPath = join(dir, 'dangling.md');
    await fs.symlink(join(dir, 'missing.md'), linkPath);

    await expect(resolveVersionedFilePath(linkPath, 'todo'))
      .rejects.toThrow(`Configured todo file is a dangling symbolic link: ${linkPath}`);
    expect((await fs.lstat(linkPath)).isSymbolicLink()).toBe(true);
  });

  it('aborts when an external edit lands before rename', async () => {
    const { version } = await readVersionedFile(filePath);
    const result = await conditionalAtomicWrite({
      resource: 'todo-test',
      filePath,
      baseVersion: version,
      content: 'replacement',
      beforeRename: () => fs.writeFile(filePath, 'external', 'utf-8')
    });
    expect(result.status).toBe('conflict');
    expect(result.latest.content).toBe('external');
    expect(await fs.readFile(filePath, 'utf-8')).toBe('external');
  });

  it('backs up the replaced content before rename', async () => {
    const { version } = await readVersionedFile(filePath);
    let backup;
    await conditionalAtomicWrite({
      resource: 'todo-test',
      filePath,
      baseVersion: version,
      content: 'replacement',
      createBackup: async (content) => {
        backup = content;
      }
    });
    expect(backup).toBe('first\r\n');
  });

  it.each(['todo', 'links'])('aborts the %s write and cleans the temp file when backup creation fails', async (resource) => {
    const { version } = await readVersionedFile(filePath);
    await expect(conditionalAtomicWrite({
      resource,
      filePath,
      baseVersion: version,
      content: 'replacement',
      createBackup: async () => {
        throw new Error('backup unavailable');
      }
    })).rejects.toMatchObject({
      name: 'BackupError',
      message: `Failed to create ${resource} backup`
    });

    expect(await fs.readFile(filePath, 'utf-8')).toBe('first\r\n');
    expect((await fs.readdir(dir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
