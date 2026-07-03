import { describe, it, expect } from 'vitest';
import { validatePath, validateFileExtension } from '../../server/pathUtils.js';

describe('validatePath', () => {
  it('accepts a valid path under /Users', () => {
    const result = validatePath('/Users/alistair/notes/todo.md');
    expect(result.isValid).toBe(true);
    expect(result.normalizedPath).toBe('/Users/alistair/notes/todo.md');
  });

  it('rejects directory traversal', () => {
    const result = validatePath('/Users/alistair/../../etc/passwd');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Directory traversal not allowed');
  });

  it('rejects paths outside the allowed prefixes', () => {
    const result = validatePath('/etc/passwd');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid path location');
  });

  it('rejects sensitive dotfile directories', () => {
    const result = validatePath('/Users/alistair/.ssh/id_rsa');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Access to sensitive directory denied');
  });

  it('rejects blocked directory patterns', () => {
    const result = validatePath('/Users/alistair/project/node_modules/thing.js');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Access to sensitive directory denied');
  });

  it('enforces a base directory when provided', () => {
    const result = validatePath('/Users/alistair/other/file.md', '/Users/alistair/allowed');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Path outside allowed directory');
  });
});

describe('validateFileExtension', () => {
  it('accepts allowed extensions (case-insensitive)', () => {
    expect(validateFileExtension('/x/pic.PNG', ['png', 'jpg'])).toEqual({ isValid: true, extension: 'png' });
  });

  it('rejects disallowed extensions', () => {
    expect(validateFileExtension('/x/file.exe', ['png', 'jpg'])).toEqual({ isValid: false, extension: 'exe' });
  });
});
