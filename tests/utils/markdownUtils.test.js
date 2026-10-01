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
  it('preserves nested lists, blank lines, and code indentation across repeated saves', () => {
    const task = [
      'This should be a bullet list:',
      '- Point one',
      '- Point two',
      '  - Bullet list within a list point',
      '  - Another sub bullet point',
      '- Point three',
      '',
      'Another paragraph.',
      '',
      '```text',
      '  indented code',
      '',
      '# Other',
      '- [ ] Not a separate task',
      '```',
      '',
      '# Done',
      '',
      '- [ ] Nested checklist',
      '  - [x] Checked child'
    ].join('\n');
    let priority = [task, 'Next task'];
    for (let i = 0; i < 3; i++) {
      const markdown = generateMarkdownFromTasks(priority, ['Other task'], ['Done task']);
      const parsed = parseMarkdownToTasks(markdown);
      expect(parsed).toEqual({ priority: [task, 'Next task'], other: ['Other task'], done: ['Done task'] });
      priority = parsed.priority;
    }
  });

  it('preserves Markdown structure with Windows line endings', () => {
    const task = 'List:\n- Parent\n  - Child\n\nParagraph';
    const markdown = generateMarkdownFromTasks([task], [], []).replace(/\n/g, '\r\n');
    expect(parseMarkdownToTasks(markdown).priority).toEqual([task]);
  });

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
  function renderBlock(text) {
    const element = document.createElement('div');
    element.innerHTML = renderMarkdown(text, { inline: false });
    return element;
  }

  it('renders nested unordered and ordered lists as blocks', () => {
    const element = renderBlock('List:\n- First\n- Second\n  - Child\n  - Another child\n- Third\n\n3. Three\n4. Four');
    expect(element.querySelectorAll(':scope > ul > li')).toHaveLength(3);
    expect(element.querySelectorAll('ul > li > ul > li')).toHaveLength(2);
    expect(element.querySelector('ol').getAttribute('start')).toBe('3');
    expect(element.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('renders headings, paragraphs, quotes, fenced code, and tables', () => {
    const element = renderBlock('# Heading\n\nFirst paragraph.\n\nSecond **paragraph**.\n\n> Quote\n\n```js\n  const value = "<tag>";\n```\n\n| A | B |\n| --- | --- |\n| one | two |');
    expect(element.querySelector('h1').textContent).toBe('Heading');
    expect(element.querySelectorAll(':scope > p')).toHaveLength(2);
    expect(element.querySelector('strong').textContent).toBe('paragraph');
    expect(element.querySelector('blockquote p').textContent).toBe('Quote');
    expect(element.querySelector('pre code').textContent).toBe('  const value = "<tag>";\n');
    expect(element.querySelectorAll('table th')).toHaveLength(2);
    expect(element.querySelectorAll('table td')).toHaveLength(2);
  });

  it('sanitizes block HTML and still rewrites local images', () => {
    const element = renderBlock('- <img src=x onerror="alert(1)">\n\n<script>alert(1)</script>\n\n<iframe src="https://example.com"></iframe>\n\n[bad](javascript:alert(1))\n\n![local](/Users/me/pic.png)');
    expect(element.querySelector('script, iframe, [onerror], [href^="javascript:"]')).toBeNull();
    expect(element.querySelector('img[alt="local"]').getAttribute('src'))
      .toBe(`/api/image?path=${encodeURIComponent('/Users/me/pic.png')}`);
  });

  it('renders inline markdown links', () => {
    const html = renderMarkdown('[link](https://example.com)');
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com"');
  });

  it('preserves safe text formatting on span and div HTML', () => {
    const element = renderBlock(
      '<span style="color:green;background-color:yellow;font-weight:700;font-style:italic;text-decoration-line:underline">inline</span>' +
      '<div style="color:blue">block</div>'
    );
    const span = element.querySelector('span');
    const div = element.querySelector('div');

    expect(span.style.color).toBe('green');
    expect(span.style.backgroundColor).toBe('yellow');
    expect(span.style.fontWeight).toBe('700');
    expect(span.style.fontStyle).toBe('italic');
    expect(span.style.textDecorationLine).toBe('underline');
    expect(div.style.color).toBe('blue');
  });

  it('removes application selector attributes while preserving safe text styles', () => {
    const element = renderBlock(
      '<span id="app" class="todo-app" style="color:green">safe text</span>'
    );
    const span = element.querySelector('span');

    expect(span.hasAttribute('id')).toBe(false);
    expect(span.hasAttribute('class')).toBe(false);
    expect(span.style.color).toBe('green');
  });

  it('rejects text-decoration thickness shorthand while preserving safe underline longhands', () => {
    const element = renderBlock(
      '<span style="text-decoration:underline solid red 100vh;' +
      'text-decoration-line:underline;text-decoration-style:solid;' +
      'text-decoration-color:red">text</span>'
    );
    const span = element.querySelector('span');

    expect(span.style.textDecorationThickness).toBe('');
    expect(span.style.textDecorationLine).toBe('underline');
    expect(span.style.textDecorationStyle).toBe('solid');
    expect(span.style.textDecorationColor).toBe('red');
    expect(span.getAttribute('style')).not.toContain('100vh');
  });

  it('removes layout-affecting CSS while preserving safe text formatting', () => {
    const element = renderBlock(
      '<div style="color:red;position:fixed;inset:0;top:0;right:0;bottom:0;left:0;' +
      'z-index:9999;width:100vw;height:100vh;display:block;transform:scale(10);' +
      'opacity:0;pointer-events:auto">text</div>'
    );
    const div = element.querySelector('div');

    expect(div.style.color).toBe('red');
    for (const property of [
      'position', 'inset', 'top', 'right', 'bottom', 'left', 'z-index',
      'width', 'height', 'display', 'transform', 'opacity', 'pointer-events'
    ]) {
      expect(div.style.getPropertyValue(property)).toBe('');
    }
  });

  it('removes URL-bearing and custom-property CSS', () => {
    const element = renderBlock(
      '<span style="color:green;--image:url(https://example.com/custom);' +
      'background:url(https://example.com/background);' +
      'background-image:url(https://example.com/image);' +
      'cursor:url(https://example.com/cursor),auto;' +
      'list-style-image:url(https://example.com/list)">text</span>'
    );
    const span = element.querySelector('span');

    expect(span.style.color).toBe('green');
    expect(span.getAttribute('style')).not.toMatch(/url\s*\(/i);
    expect(span.style.getPropertyValue('--image')).toBe('');
    expect(span.style.backgroundImage).toBe('');
    expect(span.style.cursor).toBe('');
    expect(span.style.listStyleImage).toBe('');
  });

  it('removes the style attribute when no safe declarations remain', () => {
    const element = renderBlock('<span style="position:fixed;inset:0">text</span>');
    expect(element.querySelector('span').hasAttribute('style')).toBe(false);
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
