export function handleFormattingShortcut(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return;

  const key = event.key.toLowerCase();
  if (key !== 'b' && key !== 'i') return;

  const textarea = event.target;
  if (!(textarea instanceof HTMLTextAreaElement) || textarea.readOnly || textarea.disabled) return;

  event.preventDefault();
  const { selectionStart, selectionEnd, selectionDirection } = textarea;
  const selected = textarea.value.slice(selectionStart, selectionEnd);
  if (!selected.trim()) return;

  const marker = key === 'b' ? '**' : '_';
  // Keep emphasis within each line, including selections across paragraphs.
  const formatted = selected.split('\n').map(line =>
    line.replace(/^(\s*)(.*?\S)(\s*)$/, (_, before, text, after) =>
      `${before}${marker}${text}${marker}${after}`
    )
  ).join('\n');

  textarea.setRangeText(formatted, selectionStart, selectionEnd, 'select');
  textarea.setSelectionRange(selectionStart, selectionStart + formatted.length, selectionDirection);
  // Programmatic edits must notify v-model so saving uses the formatted text.
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
