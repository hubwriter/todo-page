import { describe, it, expect } from 'vitest';
import { createLinkId, isSafeLinkUrl, normalizeUrl } from '../../src/utils/linkUtils.js';

describe('createLinkId', () => {
  it('returns a non-empty string', () => {
    const id = createLinkId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns unique ids', () => {
    expect(createLinkId()).not.toBe(createLinkId());
  });
});

describe('isSafeLinkUrl', () => {
  it('accepts http, https and file URLs', () => {
    expect(isSafeLinkUrl('http://example.com')).toBe(true);
    expect(isSafeLinkUrl('https://example.com')).toBe(true);
    expect(isSafeLinkUrl('file:///Users/me/notes.md')).toBe(true);
    expect(isSafeLinkUrl('  https://example.com  ')).toBe(true);
  });

  it('rejects unsafe schemes and non-strings', () => {
    expect(isSafeLinkUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkUrl('data:text/html,x')).toBe(false);
    expect(isSafeLinkUrl('ftp://example.com')).toBe(false);
    expect(isSafeLinkUrl('example.com')).toBe(false);
    expect(isSafeLinkUrl(null)).toBe(false);
    expect(isSafeLinkUrl(undefined)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('accepts full http(s) URLs', () => {
    expect(normalizeUrl('https://github.com/x')).toBe('https://github.com/x');
    expect(normalizeUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('prepends https:// when the scheme is missing', () => {
    expect(normalizeUrl('github.com/hubwriter/todo-page')).toBe('https://github.com/hubwriter/todo-page');
  });

  it('accepts localhost', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000/');
  });

  it('accepts file URLs and preserves them', () => {
    expect(normalizeUrl('file:///Users/alistair/notes.md')).toBe('file:///Users/alistair/notes.md');
  });

  it('rejects file URLs without a path', () => {
    expect(normalizeUrl('file:///')).toBeNull();
    expect(normalizeUrl('file://')).toBeNull();
  });

  it('rejects invalid input', () => {
    expect(normalizeUrl('not a url')).toBeNull();
    expect(normalizeUrl('notaurl')).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(42)).toBeNull();
  });

  it('rejects unsafe schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com/a  ')).toBe('https://example.com/a');
  });
});
