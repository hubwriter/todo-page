import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import {
  createBackup,
  createBackupBeforeWrite,
  createResourceBackup,
  listBackups,
  listBackupFiles,
  readBackup,
  pruneBackups
} from '../../server/backups.js';

describe('server/backups', () => {
  let dir;
  let todoPath;

  beforeEach(async () => {
    dir = await fs.mkdtemp(join(os.tmpdir(), 'todo-backups-'));
    todoPath = join(dir, 'todo.md');
    await fs.writeFile(todoPath, '# Priority\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates a backup file alongside the todo file', async () => {
    const name = await createBackup(todoPath, 'hello', new Date(2026, 6, 28, 14, 30, 52));
    expect(name).toBe('todo-backup-20260728T143052.md');
    const content = await fs.readFile(join(dir, name), 'utf-8');
    expect(content).toBe('hello');
  });

  it.each([
    ['todo', async () => createBackup(todoPath, 'private todo')],
    ['links', async () => createResourceBackup(todoPath, 'private links')]
  ])('preserves restrictive source permissions for %s backups', async (_resource, create) => {
    await fs.chmod(todoPath, 0o600);
    const name = await create();
    expect((await fs.stat(join(dir, name))).mode & 0o777).toBe(0o600);
  });

  it('avoids overwriting when two backups share the same second', async () => {
    const first = await createBackup(todoPath, 'first', new Date(2026, 6, 28, 14, 30, 52));
    const second = await createBackup(todoPath, 'second', new Date(2026, 6, 28, 14, 30, 52));

    expect(first).toBe('todo-backup-20260728T143052.md');
    expect(second).toBe('todo-backup-20260728T143053.md');
    expect(await fs.readFile(join(dir, first), 'utf-8')).toBe('first');
    expect(await fs.readFile(join(dir, second), 'utf-8')).toBe('second');
  });

  it('backs up the previous content before a changed file is written', async () => {
    await fs.writeFile(todoPath, 'previous content', 'utf-8');

    const filename = await createBackupBeforeWrite(todoPath, 'new content');

    expect(filename).toMatch(/^todo-backup-\d{8}T\d{6}\.md$/);
    expect(await fs.readFile(join(dir, filename), 'utf-8')).toBe('previous content');
    expect(await fs.readFile(todoPath, 'utf-8')).toBe('previous content');
  });

  it('does not create a backup when the content is unchanged', async () => {
    await fs.writeFile(todoPath, 'same content', 'utf-8');

    expect(await createBackupBeforeWrite(todoPath, 'same content')).toBeNull();
    expect(await listBackupFiles(todoPath)).toEqual([]);
  });

  it('lists backups newest first with ISO timestamps', async () => {
    await createBackup(todoPath, 'a', new Date(2026, 6, 28, 10, 0, 0));
    await createBackup(todoPath, 'b', new Date(2026, 6, 28, 12, 0, 0));
    await createBackup(todoPath, 'c', new Date(2026, 6, 28, 11, 0, 0));

    const backups = await listBackups(todoPath);
    expect(backups.map((b) => b.filename)).toEqual([
      'todo-backup-20260728T120000.md',
      'todo-backup-20260728T110000.md',
      'todo-backup-20260728T100000.md'
    ]);
    expect(typeof backups[0].timestamp).toBe('string');
    expect(new Date(backups[0].timestamp).getHours()).toBe(12);
  });

  it('keeps only the 10 most recent backups', async () => {
    for (let i = 0; i < 13; i++) {
      // Different timestamps (minutes apart) so filenames are unique.
      await createBackup(todoPath, `v${i}`, new Date(2026, 6, 28, 9, i, 0));
    }

    const files = await listBackupFiles(todoPath);
    expect(files).toHaveLength(10);
    // The oldest three (minutes 0,1,2) should have been pruned.
    const names = files.map((f) => f.filename);
    expect(names).toContain('todo-backup-20260728T091200.md');
    expect(names).not.toContain('todo-backup-20260728T090000.md');
    expect(names).not.toContain('todo-backup-20260728T090200.md');
  });

  it('reads a valid backup and rejects invalid filenames', async () => {
    await createBackup(todoPath, 'restore-me', new Date(2026, 6, 28, 8, 0, 0));
    expect(await readBackup(todoPath, 'todo-backup-20260728T080000.md')).toBe('restore-me');
    expect(await readBackup(todoPath, '../todo.md')).toBeNull();
    expect(await readBackup(todoPath, 'todo-backup-nope.md')).toBeNull();
    expect(await readBackup(todoPath, 'todo-backup-20260101T000000.md')).toBeNull();
  });

  it('prune is a no-op when there are fewer than the limit', async () => {
    await createBackup(todoPath, 'a', new Date(2026, 6, 28, 8, 0, 0));
    await pruneBackups(todoPath);
    expect(await listBackupFiles(todoPath)).toHaveLength(1);
  });
});
