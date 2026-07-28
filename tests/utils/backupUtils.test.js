import { describe, it, expect } from 'vitest';
import {
  formatBackupStamp,
  backupFileName,
  isBackupFileName,
  parseBackupTimestamp
} from '../../src/utils/backupUtils.js';

describe('backupUtils', () => {
  const sample = new Date(2026, 6, 28, 14, 30, 52); // 2026-07-28 14:30:52 local

  it('formats a stamp as YYYYMMDDTHHMMSS with zero padding', () => {
    expect(formatBackupStamp(sample)).toBe('20260728T143052');
    expect(formatBackupStamp(new Date(2026, 0, 5, 3, 4, 9))).toBe('20260105T030409');
  });

  it('builds the backup filename', () => {
    expect(backupFileName(sample)).toBe('todo-backup-20260728T143052.md');
  });

  it('recognises valid backup filenames', () => {
    expect(isBackupFileName('todo-backup-20260728T143052.md')).toBe(true);
    expect(isBackupFileName('todo-backup-20260105T030409.md')).toBe(true);
  });

  it('rejects invalid or malicious names', () => {
    expect(isBackupFileName('todo.md')).toBe(false);
    expect(isBackupFileName('todo-backup-2026.md')).toBe(false);
    expect(isBackupFileName('../todo-backup-20260728T143052.md')).toBe(false);
    expect(isBackupFileName('todo-backup-20260728T143052.md.txt')).toBe(false);
    expect(isBackupFileName(null)).toBe(false);
  });

  it('parses a filename back into a Date', () => {
    const date = parseBackupTimestamp('todo-backup-20260728T143052.md');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(28);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);
    expect(date.getSeconds()).toBe(52);
  });

  it('round-trips filename -> date -> filename', () => {
    const name = backupFileName(sample);
    const date = parseBackupTimestamp(name);
    expect(backupFileName(date)).toBe(name);
  });

  it('returns null for unparseable names', () => {
    expect(parseBackupTimestamp('todo.md')).toBeNull();
    expect(parseBackupTimestamp('')).toBeNull();
  });
});
