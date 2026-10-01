import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref, nextTick } from 'vue';
import { vEditHistory } from '../../src/utils/editHistory.js';
import { handleFormattingShortcut } from '../../src/utils/formattingShortcuts.js';
import { handleMarkdownPaste } from '../../src/utils/markdownPaste.js';

function setup(initial = '') {
  const wrapper = mount(defineComponent({
    directives: { editHistory: vEditHistory },
    setup() {
      return { text: ref(initial), session: ref(0), revision: ref(0), handleFormattingShortcut, handleMarkdownPaste };
    },
    template: '<textarea v-model="text" v-edit-history="session" :data-revision="revision" @keydown="handleFormattingShortcut" @paste="handleMarkdownPaste" />'
  }));
  const element = wrapper.element;
  element.setSelectionRange(initial.length, initial.length);
  return { wrapper, element };
}

async function edit(element, text, inputType = 'insertText') {
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType }));
  element.setRangeText(text, element.selectionStart, element.selectionEnd, 'end');
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: text }));
  await nextTick();
}

async function key(element, key = 'z', modifiers = { metaKey: true }) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...modifiers });
  element.dispatchEvent(event);
  await nextTick();
  return event;
}

describe('editing history', () => {
  it('retains earlier history when the component rerenders during IME composition', async () => {
    const { wrapper, element } = setup('Original');
    try {
      await edit(element, ' text');
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      await edit(element, 'n', 'insertCompositionText');
      wrapper.vm.revision++;
      await nextTick();
      element.setSelectionRange(13, 14);
      await edit(element, '\u65e5', 'insertCompositionText');
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await nextTick();
      expect(wrapper.vm.text).toBe('Original text\u65e5');
      await key(element);
      expect(wrapper.vm.text).toBe('Original text');
      await key(element);
      expect(wrapper.vm.text).toBe('Original');
      await key(element, 'z', { metaKey: true, shiftKey: true });
      await key(element, 'z', { metaKey: true, shiftKey: true });
      expect(wrapper.vm.text).toBe('Original text\u65e5');
    } finally { wrapper.unmount(); }
  });

  it.each(['deleteContentBackward', 'deleteContentForward'])('groups native %s edits and restores the caret', async inputType => {
    const { wrapper, element } = setup('abcd');
    try {
      const caret = inputType === 'deleteContentBackward' ? 4 : 0;
      element.setSelectionRange(caret, caret);
      for (let i = 0; i < 2; i++) {
        element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType }));
        const start = element.selectionStart - (inputType === 'deleteContentBackward' ? 1 : 0);
        element.setRangeText('', start, start + 1, 'end');
        element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
        await nextTick();
      }
      const deleted = inputType === 'deleteContentBackward' ? 'ab' : 'cd';
      expect(element.value).toBe(deleted);
      await key(element);
      expect(wrapper.vm.text).toBe('abcd');
      expect(element.selectionStart).toBe(caret);
      await key(element, 'y', { ctrlKey: true });
      expect(wrapper.vm.text).toBe(deleted);
    } finally { wrapper.unmount(); }
  });

  it('undoes a cut and a normal replacement paste with their original selections', async () => {
    const { wrapper, element } = setup('One two three');
    try {
      element.setSelectionRange(4, 8, 'backward');
      element.dispatchEvent(new Event('cut', { bubbles: true }));
      await edit(element, '', 'deleteByCut');
      element.setSelectionRange(4, 9, 'backward');
      await edit(element, 'four', 'insertFromPaste');
      expect(wrapper.vm.text).toBe('One four');
      await key(element);
      expect(wrapper.vm.text).toBe('One three');
      expect([element.selectionStart, element.selectionEnd, element.selectionDirection]).toEqual([4, 9, 'backward']);
      await key(element);
      expect(wrapper.vm.text).toBe('One two three');
      expect([element.selectionStart, element.selectionEnd, element.selectionDirection]).toEqual([4, 8, 'backward']);
    } finally { wrapper.unmount(); }
  });

  it('keeps every edit in a long editing session', async () => {
    const { wrapper, element } = setup();
    try {
      for (let i = 0; i < 150; i++) await edit(element, 'x', 'insertFromPaste');
      for (let i = 149; i >= 0; i--) {
        await key(element);
        expect(element.value).toBe('x'.repeat(i));
      }
      for (let i = 1; i <= 150; i++) {
        await key(element, 'z', { ctrlKey: true, shiftKey: true });
        expect(element.value).toBe('x'.repeat(i));
      }
    } finally { wrapper.unmount(); }
  });

  it('removes history listeners on unmount', async () => {
    const { wrapper, element } = setup();
    await edit(element, 'text');
    wrapper.unmount();
    expect((await key(element)).defaultPrevented).toBe(false);
    expect(element.value).toBe('text');
  });

  it.each([
    [{ metaKey: true }, 'z', { metaKey: true, shiftKey: true }],
    [{ ctrlKey: true }, 'z', { ctrlKey: true, shiftKey: true }],
    [{ ctrlKey: true }, 'y', { ctrlKey: true }]
  ])('undoes all mixed edits and redoes them using %j', async (undo, redoKey, redo) => {
    const { wrapper, element } = setup('Read');
    try {
      await edit(element, ' this site');
      element.setSelectionRange(5, 14, 'backward');
      await key(element, 'i', { metaKey: true });
      expect(element.value).toBe('Read _this site_');
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'https://example.com' } });
      element.dispatchEvent(paste);
      await nextTick();
      expect(element.value).toBe('Read [_this site_](https://example.com)');
      await key(element, 'z', undo);
      expect(element.value).toBe('Read _this site_');
      await key(element, 'z', undo);
      expect(element.value).toBe('Read this site');
      expect([element.selectionStart, element.selectionEnd, element.selectionDirection]).toEqual([5, 14, 'backward']);
      await key(element, 'z', undo);
      expect(wrapper.vm.text).toBe('Read');
      await key(element, 'z', undo);
      expect(element.value).toBe('Read');
      for (const expected of ['Read this site', 'Read _this site_', 'Read [_this site_](https://example.com)']) {
        await key(element, redoKey, redo);
        expect(wrapper.vm.text).toBe(expected);
      }
      await key(element, redoKey, redo);
      expect(element.value).toBe('Read [_this site_](https://example.com)');
    } finally {
      wrapper.unmount();
    }
  });

  it('groups continuous typing but separates pauses, navigation, deletion, and paste', async () => {
    vi.useFakeTimers();
    const { wrapper, element } = setup();
    try {
      await edit(element, 'a');
      await edit(element, 'b');
      vi.advanceTimersByTime(1100);
      await edit(element, 'c');
      await key(element, 'ArrowLeft', {});
      await edit(element, 'd');
      element.setSelectionRange(3, 4);
      await edit(element, '', 'deleteContentBackward');
      await edit(element, 'paste', 'insertFromPaste');
      for (const expected of ['abc', 'abcd', 'abc', 'ab', '']) {
        await key(element);
        expect(element.value).toBe(expected);
      }
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('discards redo after a new edit and retains history on blur', async () => {
    const { wrapper, element } = setup('start');
    try {
      await edit(element, ' one', 'insertFromPaste');
      await edit(element, ' two', 'insertFromPaste');
      await key(element);
      await edit(element, ' new');
      await key(element, 'z', { metaKey: true, shiftKey: true });
      expect(element.value).toBe('start one new');
      element.dispatchEvent(new Event('blur'));
      await key(element);
      expect(element.value).toBe('start one');
      await key(element);
      expect(element.value).toBe('start');
    } finally { wrapper.unmount(); }
  });

  it('resets on external replacement or a new session even with identical text', async () => {
    const { wrapper, element } = setup('initial');
    try {
      await edit(element, ' edit');
      wrapper.vm.session++;
      await nextTick();
      await key(element);
      expect(element.value).toBe('initial edit');
      await edit(element, ' more');
      wrapper.vm.text = 'another entry';
      await nextTick();
      await key(element);
      expect(element.value).toBe('another entry');
    } finally { wrapper.unmount(); }
  });

  it('handles browser history input events and prevents falling back to stale native history', async () => {
    const { wrapper, element } = setup('original');
    try {
      await edit(element, ' changed');
      for (const [inputType, expected] of [
        ['historyUndo', 'original'], ['historyUndo', 'original'],
        ['historyRedo', 'original changed']
      ]) {
        const event = new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType });
        element.dispatchEvent(event);
        await nextTick();
        expect(event.defaultPrevented).toBe(true);
        expect(wrapper.vm.text).toBe(expected);
      }
    } finally { wrapper.unmount(); }
  });

  it('records an IME composition as one edit', async () => {
    const { wrapper, element } = setup();
    try {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      await edit(element, 'n', 'insertCompositionText');
      element.setSelectionRange(0, 1);
      await edit(element, '\u65e5', 'insertCompositionText');
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
      await nextTick();
      expect(wrapper.vm.text).toBe('\u65e5');
      await key(element);
      expect(wrapper.vm.text).toBe('');
      await key(element, 'z', { metaKey: true, shiftKey: true });
      expect(wrapper.vm.text).toBe('\u65e5');
    } finally { wrapper.unmount(); }
  });

  it('leaves unrelated shortcuts and read-only fields alone', async () => {
    const { wrapper, element } = setup();
    try {
      await edit(element, 'text');
      expect((await key(element, 'z', {})).defaultPrevented).toBe(false);
      expect((await key(element, 'z', { ctrlKey: true, altKey: true })).defaultPrevented).toBe(false);
      element.readOnly = true;
      expect((await key(element)).defaultPrevented).toBe(false);
      expect(element.value).toBe('text');
    } finally { wrapper.unmount(); }
  });
});
