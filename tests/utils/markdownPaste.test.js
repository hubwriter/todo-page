import { describe, it, expect, vi } from 'vitest';
import { handleMarkdownPaste } from '../../src/utils/markdownPaste.js';
import { renderMarkdown } from '../../src/utils/markdownUtils.js';

function createEditor(text = 'See this website today', start = 4, end = 16, tag = 'textarea') {
  const textarea = document.createElement(tag);
  textarea.value = text;
  textarea.setSelectionRange(start, end);
  textarea.addEventListener('paste', handleMarkdownPaste);
  return textarea;
}

function paste(textarea, text) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: text === null ? null : { getData: type => type === 'text/plain' ? text : '' }
  });
  textarea.dispatchEvent(event);
  return event;
}

describe('Markdown URL paste', () => {
  it('does not override a paste already handled by another listener', () => {
    const textarea = createEditor();
    textarea.addEventListener('paste', event => event.preventDefault(), { capture: true });
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    paste(textarea, 'https://example.com');
    expect(textarea.value).toBe('See this website today');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('turns the selected text into the exact requested Markdown link and updates the model', () => {
    const textarea = createEditor();
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    const event = paste(textarea, 'https://www.bbc.co.uk/news');
    const replacement = '[this website](https://www.bbc.co.uk/news)';
    expect(event.defaultPrevented).toBe(true);
    expect(textarea.value).toBe(`See ${replacement} today`);
    expect(textarea.selectionStart).toBe(4 + replacement.length);
    expect(textarea.selectionEnd).toBe(textarea.selectionStart);
    expect(onInput).toHaveBeenCalledOnce();
    expect(renderMarkdown(textarea.value)).toBe('See <a href="https://www.bbc.co.uk/news">this website</a> today');
  });

  it.each([
    'http://example.com/path',
    'https://intranet/page',
    'http://localhost:3000',
    'https://[::1]/path',
    'HTTPS://example.com/path?one=1&two=2#section',
    'file:///Users/me/notes.md',
    'file://server/share/notes.md',
    'ftp://example.com/file',
    'ftps://example.com/file',
    'mailto:reader@example.com',
    'tel:+15551234567'
  ])('accepts a valid explicit URL: %s', url => {
    const textarea = createEditor();
    expect(paste(textarea, url).defaultPrevented).toBe(true);
    expect(textarea.value).toBe(`See [this website](${url}) today`);
  });

  it('trims surrounding clipboard whitespace', () => {
    const textarea = createEditor();
    paste(textarea, ' \nhttps://example.com/path\r\n ');
    expect(textarea.value).toBe('See [this website](https://example.com/path) today');
  });

  it('escapes brackets and backslashes in the label and Markdown delimiters in the URL', () => {
    const text = 'notes [draft]\\final';
    const textarea = createEditor(text, 0, text.length);
    paste(textarea, 'https://example.com/a)b(<draft>');
    expect(textarea.value).toBe('[notes \\[draft\\]\\\\final](https://example.com/a%29b%28%3Cdraft%3E)');
    const element = document.createElement('div');
    element.innerHTML = renderMarkdown(textarea.value);
    expect(element.querySelectorAll('a')).toHaveLength(1);
    expect(element.querySelector('a').textContent).toBe(text);
    expect(element.querySelector('a').getAttribute('href')).toBe('https://example.com/a%29b%28%3Cdraft%3E');
  });

  it.each([
    'ordinary replacement text',
    'example.com',
    'https://',
    'http://?query',
    'file://',
    'mailto:',
    'https://example.com some text',
    'https://example.com\nhttps://another.com',
    'https://exam\tple.com',
    'https://example.com/\u0000',
    'javascript:alert(1)',
    'data:text/html,hello',
    '',
    null
  ])('leaves native paste in control for %j', text => {
    const textarea = createEditor();
    const onInput = vi.fn();
    textarea.addEventListener('input', onInput);
    expect(paste(textarea, text).defaultPrevented).toBe(false);
    expect(textarea.value).toBe('See this website today');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('leaves a URL paste with no selection unchanged', () => {
    const textarea = createEditor('text', 2, 2);
    expect(paste(textarea, 'https://example.com').defaultPrevented).toBe(false);
    expect(textarea.value).toBe('text');
  });

  it.each(['readOnly', 'disabled'])('does not change a %s field', property => {
    const textarea = createEditor();
    textarea[property] = true;
    expect(paste(textarea, 'https://example.com').defaultPrevented).toBe(false);
    expect(textarea.value).toBe('See this website today');
  });

  it('does not transform plain input fields', () => {
    const input = createEditor('text', 0, 4, 'input');
    expect(paste(input, 'https://example.com').defaultPrevented).toBe(false);
    expect(input.value).toBe('text');
  });
});
