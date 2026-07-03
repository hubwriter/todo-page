import { describe, it, expect } from 'vitest';
import { sanitizeLinkCategories } from '../../server/linkValidation.js';

const genId = () => 'fixed-id';

describe('sanitizeLinkCategories', () => {
  it('accepts a valid payload and returns trimmed, cleaned categories', () => {
    const input = [{ name: '  GitHub  ', links: [{ id: 'a1', url: '  https://github.com  ', description: 'repo' }] }];
    const result = sanitizeLinkCategories(input, genId);
    expect(result.isValid).toBe(true);
    expect(result.value).toEqual([
      { name: 'GitHub', links: [{ id: 'a1', url: 'https://github.com', description: 'repo' }] }
    ]);
  });

  it('accepts file:// URLs', () => {
    const input = [{ name: 'Local', links: [{ id: 'f1', url: 'file:///Users/me/notes.md', description: '' }] }];
    expect(sanitizeLinkCategories(input, genId).isValid).toBe(true);
  });

  it('generates an id when one is missing', () => {
    const input = [{ name: 'C', links: [{ url: 'https://x.com', description: '' }] }];
    const result = sanitizeLinkCategories(input, genId);
    expect(result.value[0].links[0].id).toBe('fixed-id');
  });

  it('rejects a non-array', () => {
    const result = sanitizeLinkCategories('nope');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Categories must be an array');
  });

  it('rejects a category without a name', () => {
    const result = sanitizeLinkCategories([{ links: [] }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Each category must have a name');
  });

  it('rejects an empty category name', () => {
    expect(sanitizeLinkCategories([{ name: '   ', links: [] }]).isValid).toBe(false);
  });

  it('rejects a category without a links array', () => {
    const result = sanitizeLinkCategories([{ name: 'C' }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Each category must have a links array');
  });

  it('rejects a link without a URL', () => {
    const result = sanitizeLinkCategories([{ name: 'C', links: [{ description: 'x' }] }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Each link must have a URL');
  });

  it('rejects unsafe URL schemes', () => {
    const result = sanitizeLinkCategories([{ name: 'C', links: [{ url: 'javascript:alert(1)', description: '' }] }]);
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Each link URL must be a valid http(s) or file URL');
  });
});
