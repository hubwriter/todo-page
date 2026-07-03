import { describe, it, expect } from 'vitest';
import { tabToHash, hashToTab, getTabFromHash, DEFAULT_TAB } from '../../src/utils/tabRouting.js';

describe('tabToHash', () => {
  it('maps tab keys to hashes', () => {
    expect(tabToHash('tasks')).toBe('tasks');
    expect(tabToHash('editor')).toBe('markdown');
    expect(tabToHash('notes')).toBe('notes');
    expect(tabToHash('links')).toBe('links');
  });

  it('defaults to tasks for unknown tabs', () => {
    expect(tabToHash('bogus')).toBe('tasks');
    expect(tabToHash(undefined)).toBe('tasks');
  });
});

describe('hashToTab', () => {
  it('maps hashes to tab keys (with or without #)', () => {
    expect(hashToTab('#markdown')).toBe('editor');
    expect(hashToTab('markdown')).toBe('editor');
    expect(hashToTab('#links')).toBe('links');
    expect(hashToTab('#tasks')).toBe('tasks');
    expect(hashToTab('#notes')).toBe('notes');
  });

  it('returns null for unknown or empty hashes', () => {
    expect(hashToTab('#bogus')).toBeNull();
    expect(hashToTab('')).toBeNull();
    expect(hashToTab(null)).toBeNull();
    expect(hashToTab(undefined)).toBeNull();
  });
});

describe('getTabFromHash', () => {
  it('resolves a valid hash', () => {
    expect(getTabFromHash('#links')).toBe('links');
    expect(getTabFromHash('#markdown')).toBe('editor');
  });

  it('defaults to tasks for missing or invalid hashes', () => {
    expect(getTabFromHash('')).toBe('tasks');
    expect(getTabFromHash('#bogus')).toBe('tasks');
    expect(getTabFromHash(undefined)).toBe('tasks');
  });

  it('exposes DEFAULT_TAB', () => {
    expect(DEFAULT_TAB).toBe('tasks');
  });
});
