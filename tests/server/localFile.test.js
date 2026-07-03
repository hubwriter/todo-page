import { describe, it, expect } from 'vitest';
import {
  fileUrlToNormalizedPath,
  isPathReferencedByCategories,
  getLocalFileContentType
} from '../../server/localFile.js';

describe('fileUrlToNormalizedPath', () => {
  it('converts a file URL to a normalized path', () => {
    expect(fileUrlToNormalizedPath('file:///Users/me/notes.md')).toBe('/Users/me/notes.md');
  });

  it('decodes percent-encoded characters', () => {
    expect(fileUrlToNormalizedPath('file:///Users/me/My%20Notes.md')).toBe('/Users/me/My Notes.md');
  });

  it('returns null for non-file URLs', () => {
    expect(fileUrlToNormalizedPath('https://example.com')).toBeNull();
    expect(fileUrlToNormalizedPath('not a url')).toBeNull();
  });
});

describe('isPathReferencedByCategories', () => {
  const categories = [
    { name: 'Local', links: [{ id: 'f1', url: 'file:///Users/me/notes.md', description: '' }] },
    { name: 'Web', links: [{ id: 'h1', url: 'https://example.com', description: '' }] }
  ];

  it('returns true for a referenced file path', () => {
    expect(isPathReferencedByCategories(categories, '/Users/me/notes.md')).toBe(true);
  });

  it('returns false for an unreferenced path', () => {
    expect(isPathReferencedByCategories(categories, '/Users/me/other.md')).toBe(false);
  });

  it('returns false for non-array input', () => {
    expect(isPathReferencedByCategories(null, '/x')).toBe(false);
  });
});

describe('getLocalFileContentType', () => {
  it('serves markdown/text as plain text', () => {
    expect(getLocalFileContentType('/x/notes.md')).toBe('text/plain; charset=utf-8');
    expect(getLocalFileContentType('/x/file.txt')).toBe('text/plain; charset=utf-8');
  });

  it('serves images with their image type', () => {
    expect(getLocalFileContentType('/x/pic.png')).toBe('image/png');
  });

  it('serves pdf as application/pdf', () => {
    expect(getLocalFileContentType('/x/doc.pdf')).toBe('application/pdf');
  });
});
