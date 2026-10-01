import { describe, it, expect, vi } from 'vitest';
import { handleFormattingShortcut } from '../../src/utils/formattingShortcuts.js';
import { renderMarkdown } from '../../src/utils/markdownUtils.js';

function editor(value, start, end, tag = 'textarea') {
  const field = document.createElement(tag);
  field.value = value;
  field.setSelectionRange(start, end, 'backward');
  field.addEventListener('keydown', handleFormattingShortcut);
  return field;
}

function press(field, options) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options });
  field.dispatchEvent(event);
  return event;
}

describe('formatting shortcuts', () => {
  it.each([
    ['metaKey', 'b', '**', 'strong'],
    ['metaKey', 'i', '_', 'em'],
    ['ctrlKey', 'b', '**', 'strong'],
    ['ctrlKey', 'i', '_', 'em']
  ])('formats selected text with %s + %s', (modifier, key, marker, tag) => {
    const field = editor('Buy some milk today', 4, 13);
    const onInput = vi.fn();
    field.addEventListener('input', onInput);
    const event = press(field, { key, [modifier]: true });

    expect(event.defaultPrevented).toBe(true);
    expect(field.value).toBe(`Buy ${marker}some milk${marker} today`);
    expect(renderMarkdown(field.value)).toBe(`Buy <${tag}>some milk</${tag}> today`);
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe(`${marker}some milk${marker}`);
    expect(field.selectionDirection).toBe('backward');
    expect(onInput).toHaveBeenCalledOnce();
  });

  it.each([['b', '**', 'strong'], ['i', '_', 'em']])('keeps whitespace and blank lines intact with %s', (key, marker, tag) => {
    const text = '  first line \n\n second line  ';
    const field = editor(text, 0, text.length);
    press(field, { key, ctrlKey: true });
    expect(field.value).toBe(`  ${marker}first line${marker} \n\n ${marker}second line${marker}  `);
    expect(renderMarkdown(field.value.split('\n')[0])).toContain(`<${tag}>first line</${tag}>`);
    expect(renderMarkdown(field.value.split('\n')[2])).toContain(`<${tag}>second line</${tag}>`);
  });

  it.each(['', '   ', '\n'])('does not insert empty formatting for %j', text => {
    const field = editor(text, 0, text.length);
    const onInput = vi.fn();
    field.addEventListener('input', onInput);
    press(field, { key: 'i', metaKey: true });
    expect(field.value).toBe(text);
    expect(onInput).not.toHaveBeenCalled();
  });

  it('does not change text when the selection is collapsed', () => {
    const field = editor('Buy milk', 4, 4);
    press(field, { key: 'b', ctrlKey: true });
    expect(field.value).toBe('Buy milk');
  });

  it.each([
    { key: 'b' },
    { key: 'i' },
    { key: 'Enter', metaKey: true },
    { key: 'b', ctrlKey: true, altKey: true },
    { key: 'I', metaKey: true, shiftKey: true },
    { key: 'b', ctrlKey: true, isComposing: true }
  ])('leaves unrelated key presses alone: %j', options => {
    const field = editor('text', 0, 4);
    expect(press(field, options).defaultPrevented).toBe(false);
    expect(field.value).toBe('text');
  });

  it('does not format plain input fields', () => {
    const field = editor('text', 0, 4, 'input');
    expect(press(field, { key: 'b', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(field.value).toBe('text');
  });

  it.each(['readOnly', 'disabled'])('does not format a %s textarea', property => {
    const field = editor('text', 0, 4);
    field[property] = true;
    expect(press(field, { key: 'b', metaKey: true }).defaultPrevented).toBe(false);
    expect(field.value).toBe('text');
  });
});
