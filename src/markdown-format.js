/**
 * First-version Markdown formatting helpers. Pure text transforms over
 * `{ text, start, end }` so the floating editor only has to apply the result through the
 * existing EditorSession (auto-save, conflict detection, failure recovery all stay intact).
 * Deliberately not a Markdown parser: each helper does the smallest sensible toggle.
 */

export const BOLD_MARKER = '**';
export const ITALIC_MARKER = '*';
export const HIGHLIGHT_MARKER = '==';
export const CODE_MARKER = '`';
export const QUOTE_PREFIX = '> ';
export const LIST_PREFIX = '- ';
/** 0 is 正文; 1–3 are H1–H3. */
export const HEADING_LEVELS = [0, 1, 2, 3];

const HEADING_PATTERN = /^#{1,6}\s+/;

function clamp(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(Math.trunc(number), max));
}

function markerRunBefore(text, index, character) {
  let count = 0;
  while (index - 1 - count >= 0 && text[index - 1 - count] === character) count += 1;
  return count;
}

function markerRunAfter(text, index, character) {
  let count = 0;
  while (index + count < text.length && text[index + count] === character) count += 1;
  return count;
}

/**
 * True only when the selection is wrapped by exactly this marker. The exact-run check is
 * what keeps italic from mistaking `**bold**` for `*italic*` and stripping one star.
 */
function isWrapped(text, start, end, marker) {
  if (start < marker.length || end + marker.length > text.length) return false;
  if (markerRunBefore(text, start, marker[0]) !== marker.length) return false;
  if (markerRunAfter(text, end, marker[0]) !== marker.length) return false;
  return true;
}

/** Wraps/unwraps the selection, keeping the inner text selected. */
export function toggleInlineFormat(state, marker) {
  const text = String(state?.text ?? '');
  const start = clamp(state?.start, text.length);
  const end = clamp(state?.end, text.length);
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const size = marker.length;

  if (from === to) {
    const next = `${text.slice(0, from)}${marker}${marker}${text.slice(to)}`;
    return { text: next, start: from + size, end: from + size };
  }
  if (isWrapped(text, from, to, marker)) {
    const next = `${text.slice(0, from - size)}${text.slice(from, to)}${text.slice(to + size)}`;
    return { text: next, start: from - size, end: to - size };
  }
  const next = `${text.slice(0, from)}${marker}${text.slice(from, to)}${marker}${text.slice(to)}`;
  return { text: next, start: from + size, end: to + size };
}

/** The whole lines the selection touches, as a half-open range that excludes the newline. */
function lineRange(text, start, end) {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const newline = text.indexOf('\n', Math.max(from, end - 1));
  return { from, to: newline === -1 ? text.length : newline };
}

function transformBlock(text, start, end, transform) {
  const { from, to } = lineRange(text, start, end);
  const block = text.slice(from, to);
  if (!block) return { text, start: from, end: to };
  const next = transform(block.split('\n')).join('\n');
  return { text: `${text.slice(0, from)}${next}${text.slice(to)}`, start: from, end: from + next.length };
}

/**
 * Toggles a line prefix. Each line flips on its own, so a half-prefixed block ends up
 * fully consistent instead of gaining a doubled prefix.
 */
export function toggleLinePrefix(state, prefix) {
  const text = String(state?.text ?? '');
  const start = clamp(state?.start, text.length);
  const end = clamp(state?.end, text.length);
  return transformBlock(text, Math.min(start, end), Math.max(start, end), (lines) => lines.map((line) => {
    if (!line.trim()) return line;
    return line.startsWith(prefix) ? line.slice(prefix.length) : `${prefix}${line}`;
  }));
}

/** Sets an explicit heading level on whole lines; level 0 strips the heading (正文). */
export function setHeading(state, level) {
  const text = String(state?.text ?? '');
  const start = clamp(state?.start, text.length);
  const end = clamp(state?.end, text.length);
  const prefix = level > 0 ? `${'#'.repeat(level)} ` : '';
  return transformBlock(text, Math.min(start, end), Math.max(start, end), (lines) => lines.map((line) => {
    if (!line.trim()) return line;
    return `${prefix}${line.replace(HEADING_PATTERN, '')}`;
  }));
}
