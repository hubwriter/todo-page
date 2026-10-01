import { isSafeLinkUrl } from './linkUtils.js';

export function handleMarkdownPaste(event) {
  const textarea = event.target;
  if (event.defaultPrevented || !(textarea instanceof HTMLTextAreaElement) ||
      textarea.readOnly || textarea.disabled) return;

  const { selectionStart, selectionEnd } = textarea;
  if (selectionStart === selectionEnd) return;

  const url = event.clipboardData?.getData('text/plain').trim();
  if (!url || /[\s\u0000-\u001f\u007f]/.test(url)) return;
  if (!isSafeLinkUrl(url) && !/^(?:ftps?:\/\/|mailto:|tel:)/i.test(url)) return;

  try {
    const parsed = new URL(url);
    if (!parsed.hostname && (!parsed.pathname || parsed.pathname === '/')) return;
  } catch {
    // Non-URLs keep the browser's normal paste behavior.
    return;
  }

  const label = textarea.value.slice(selectionStart, selectionEnd).replace(/[\\[\]]/g, '\\$&');
  // Encode characters that could terminate or escape a Markdown destination.
  const destination = url.replace(/[\\()<>]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  event.preventDefault();
  textarea.setRangeText(`[${label}](${destination})`, selectionStart, selectionEnd, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}
