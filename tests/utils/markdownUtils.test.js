import { describe, it, expect } from 'vitest';
import {
  parseMarkdownToTasks,
  generateMarkdownFromTasks,
  addDateToTask,
  removeDateFromTask,
  renderMarkdown,
  transformImagePaths
} from '../../src/utils/markdownUtils.js';

describe('parseMarkdownToTasks', () => {
  it('parses sections and tasks', () => {
    const md = [
      '# Priority',
      '',
      '- [ ] Task one',
      '- [ ] Task two',
      '',
      '# Other',
      '',
      '- [ ] Other task',
      '',
      '# Done',
      '',
      '- [x] 2025-01-01 - Done task',
      ''
    ].join('\n');
    const result = parseMarkdownToTasks(md);
    expect(result.priority).toEqual(['Task one', 'Task two']);
    expect(result.other).toEqual(['Other task']);
    expect(result.done).toEqual(['2025-01-01 - Done task']);
  });

  it('handles multi-line (continuation) tasks', () => {
    const md = ['# Priority', '', '- [ ] First line', '  second line', '', '# Other', '', '# Done', ''].join('\n');
    const result = parseMarkdownToTasks(md);
    expect(result.priority).toEqual(['First line\nsecond line']);
  });

  it('returns empty sections for empty content', () => {
    const result = parseMarkdownToTasks('# Priority\n\n# Other\n\n# Done\n');
    expect(result).toEqual({ priority: [], other: [], done: [] });
  });
});

describe('generateMarkdownFromTasks', () => {
  it('round-trips with parseMarkdownToTasks', () => {
    const priority = ['Task one', 'Multi\nline'];
    const other = ['Other'];
    const done = ['2025-01-01 - Done'];
    const md = generateMarkdownFromTasks(priority, other, done);
    const parsed = parseMarkdownToTasks(md);
    expect(parsed.priority).toEqual(priority);
    expect(parsed.other).toEqual(other);
    expect(parsed.done).toEqual(done);
  });

  it('uses [ ] for priority/other and [x] for done', () => {
    const md = generateMarkdownFromTasks(['P'], ['O'], ['D']);
    expect(md).toContain('- [ ] P');
    expect(md).toContain('- [ ] O');
    expect(md).toContain('- [x] D');
  });
});

describe('addDateToTask / removeDateFromTask', () => {
  it('adds an ISO date prefix', () => {
    expect(addDateToTask('My task')).toMatch(/^\d{4}-\d{2}-\d{2} - My task$/);
  });

  it('removes a date prefix', () => {
    expect(removeDateFromTask('2025-01-01 - My task')).toBe('My task');
  });

  it('leaves text without a date prefix unchanged', () => {
    expect(removeDateFromTask('No date here')).toBe('No date here');
  });
});

describe('renderMarkdown', () => {
  it('renders inline markdown links', () => {
    const html = renderMarkdown('[link](https://example.com)');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com"');
  });

  it('sanitizes dangerous attributes (XSS)', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('strips script tags', () => {
    const html = renderMarkdown('hello <script>alert(1)</script>');
    expect(html.toLowerCase()).not.toContain('<script');
  });

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('');
  });
});

describe('transformImagePaths', () => {
  it('rewrites absolute local image paths to the API', () => {
    const out = transformImagePaths('![alt](/Users/me/pic.png)');
    expect(out).toContain('/api/image?path=');
    expect(out).toContain(encodeURIComponent('/Users/me/pic.png'));
  });

  it('leaves remote images unchanged', () => {
    const input = '![alt](https://example.com/pic.png)';
    expect(transformImagePaths(input)).toBe(input);
  });
});
