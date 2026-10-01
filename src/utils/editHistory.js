const histories = new WeakMap();

function snapshot(element) {
  return {
    value: element.value,
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection
  };
}

function createHistory(element) {
  let current = snapshot(element);
  let past = [];
  let future = [];
  let pending = null;
  let group = null;
  let composing = false;
  let applying = false;
  const listeners = [];

  function reset() {
    current = snapshot(element);
    past = [];
    future = [];
    pending = null;
    group = null;
  }

  function prepare() {
    if (!composing) pending = snapshot(element);
  }

  function record(event) {
    if (applying || composing) return;
    const after = snapshot(element);
    const before = pending || current;
    pending = null;
    if (after.value === current.value) return;

    const type = event.inputType;
    const time = Date.now();
    const canGroup = ['insertText', 'deleteContentBackward', 'deleteContentForward'].includes(type) &&
      before.start === before.end && group?.type === type && time - group.time < 1000 &&
      current.start === before.start && current.end === before.end && future.length === 0;
    if (canGroup) {
      past[past.length - 1].after = after;
    } else {
      past.push({ before, after });
    }
    current = after;
    future = [];
    group = type ? { type, time } : null;
  }

  function restore(redo) {
    if (element.readOnly || element.disabled || composing) return;
    const from = redo ? future : past;
    const change = from.pop();
    if (!change) return;
    (redo ? past : future).push(change);
    current = redo ? change.after : change.before;
    group = null;
    pending = null;
    applying = true;
    try {
      element.value = current.value;
      element.setSelectionRange(current.start, current.end, current.direction);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } finally {
      applying = false;
    }
  }

  function listen(type, handler, capture = false) {
    element.addEventListener(type, handler, capture);
    listeners.push(() => element.removeEventListener(type, handler, capture));
  }

  listen('keydown', event => {
    if (event.isComposing || composing || element.readOnly || element.disabled) return;
    const key = event.key.toLowerCase();
    if ((event.metaKey || event.ctrlKey) && !event.altKey &&
        (key === 'z' || (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey))) {
      event.preventDefault();
      restore(key === 'y' || event.shiftKey);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey ||
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Tab'].includes(event.key)) {
      group = null;
    }
    prepare();
  }, true);
  listen('beforeinput', event => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      if (element.readOnly || element.disabled || composing) return;
      event.preventDefault();
      restore(event.inputType === 'historyRedo');
    } else {
      prepare();
    }
  });
  // Capture selection before application paste/formatting handlers replace it.
  listen('paste', () => { group = null; prepare(); }, true);
  listen('cut', () => { group = null; prepare(); }, true);
  listen('pointerdown', () => { group = null; });
  listen('blur', () => { group = null; pending = null; });
  listen('input', record);
  listen('compositionstart', () => {
    group = null;
    prepare();
    composing = true;
  });
  listen('compositionend', () => {
    composing = false;
    record({});
  });

  return {
    reset,
    sync() {
      // Vue leaves the in-progress composition in the DOM until compositionend.
      if (!composing && element.value !== current.value) reset();
    },
    destroy() {
      listeners.forEach(remove => remove());
    }
  };
}

// Binding value identifies an editing session. External model replacements also
// reset history, but normal input and Markdown autosaves retain it.
export const vEditHistory = {
  mounted(element) {
    histories.set(element, createHistory(element));
  },
  updated(element, binding) {
    const history = histories.get(element);
    if (binding.value !== binding.oldValue) history.reset();
    else history.sync();
  },
  beforeUnmount(element) {
    histories.get(element)?.destroy();
    histories.delete(element);
  }
};
