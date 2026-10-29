/**
 * Excerpt anchor: the pure half of an `kcExcerpt` sticker. It snapshots the quote and
 * enough surrounding context to relocate it after the source Markdown has changed.
 * Nothing here reads or writes a file.
 */

export const EXCERPT_VERSION = 1;
/** How much surrounding context is kept for re-location. */
export const EXCERPT_CONTEXT = 32;

const MARKDOWN_PATH = /\.md$/i;

/**
 * The single rule for "this string references a Markdown note": trimmed, and ending in
 * `.md`. Validation, the delete-safety scan, and display all go through it, so a value can
 * never be accepted by one and silently ignored by another.
 * @returns the normalized path, or null when the value is not a Markdown reference.
 */
export function markdownReference(value) {
  if (typeof value !== 'string') return null;
  const path = value.trim();
  return MARKDOWN_PATH.test(path) ? path : null;
}

/** The normalized Markdown path an `kcExcerpt` points at, or null when it has none. */
export function excerptSourcePath(anchor) {
  return markdownReference(anchor?.sourceFile);
}

function slice(source, from, to) {
  return String(source).slice(Math.max(0, from), Math.max(0, to));
}

/**
 * @returns the `kcExcerpt` payload, or null when the selection is empty/whitespace-only.
 */
export function createExcerptAnchor({ source, start, end, sourceFile, now = () => new Date() }) {
  const text = String(source ?? '');
  const from = Math.max(0, Math.min(Number(start) || 0, Number(end) || 0));
  const to = Math.min(text.length, Math.max(Number(start) || 0, Number(end) || 0));
  const quote = text.slice(from, to);
  if (!quote.trim()) return null;
  const stamp = typeof now === 'function' ? now() : now;
  return {
    version: EXCERPT_VERSION,
    sourceFile: String(sourceFile ?? ''),
    quote,
    start: from,
    end: to,
    prefix: slice(text, from - EXCERPT_CONTEXT, from),
    suffix: slice(text, to, to + EXCERPT_CONTEXT),
    createdAt: stamp instanceof Date ? stamp.toISOString() : new Date(stamp).toISOString(),
  };
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/** @returns null when the payload is usable, otherwise a human-readable reason. */
export function validateExcerptAnchor(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '摘录元数据不是对象';
  if (value.version !== EXCERPT_VERSION) return `不支持的摘录版本：${String(value.version)}`;
  if (!excerptSourcePath(value)) return '摘录的 sourceFile 必须是 Markdown 路径';
  if (typeof value.quote !== 'string' || !value.quote.trim()) return '摘录缺少 quote';
  if (!Number.isInteger(value.start) || !Number.isInteger(value.end) || value.start < 0 || value.end < value.start) {
    return '摘录的 start/end 不合法';
  }
  if (typeof value.prefix !== 'string' || typeof value.suffix !== 'string') return '摘录的 prefix/suffix 不合法';
  // Timestamps are optional for excerpts created before this field existed, but a present
  // one must be a real ISO instant instead of arbitrary text.
  if (value.createdAt !== undefined && !isIsoTimestamp(value.createdAt)) return '摘录的 createdAt 不是合法时间';
  if (value.updatedAt !== undefined && !isIsoTimestamp(value.updatedAt)) return '摘录的 updatedAt 不是合法时间';
  return null;
}

/** A short local-time label for a stored ISO instant; blank when it cannot be parsed. */
export function formatLocalTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

/**
 * Excerpts cut from `sourceFile` whose quote can no longer be located in `content`.
 * These are the only ones a successful save may stamp with `updatedAt`.
 */
export function staleExcerptIds(nodes, sourceFile, content) {
  const ids = [];
  for (const node of nodes ?? []) {
    const anchor = node?.kcExcerpt;
    if (!anchor || anchor.sourceFile !== sourceFile) continue;
    if (!locateExcerpt(content, anchor).found) ids.push(node.id);
  }
  return ids;
}

/** Stamps `updatedAt` on exactly the given excerpts; `createdAt` is never rewritten. */
export function markExcerptsUpdated(nodes, ids, updatedAt) {
  const target = ids instanceof Set ? ids : new Set(ids ?? []);
  let changed = 0;
  for (const node of nodes ?? []) {
    if (!target.has(node?.id) || !node.kcExcerpt) continue;
    node.kcExcerpt = { ...node.kcExcerpt, updatedAt };
    changed += 1;
  }
  return changed;
}

function occurrencesOf(text, quote) {
  const matches = [];
  let index = text.indexOf(quote);
  while (index !== -1) {
    matches.push(index);
    index = text.indexOf(quote, index + 1);
  }
  return matches;
}

function contextScore(text, at, quote, prefix, suffix) {
  let score = 0;
  if (prefix && at >= prefix.length && text.slice(at - prefix.length, at) === prefix) score += 1;
  if (suffix && text.slice(at + quote.length, at + quote.length + suffix.length) === suffix) score += 1;
  return score;
}

/**
 * Relocation order: saved offsets, then a unique quote match, then the most credible
 * of several matches (best prefix/suffix, nearest to the original offset).
 * @returns `{ found, start, end, strategy }` with strategy `offsets|unique|context|none`.
 */
export function locateExcerpt(source, anchor) {
  const text = String(source ?? '');
  const quote = typeof anchor?.quote === 'string' ? anchor.quote : '';
  if (!quote) return { found: false, strategy: 'none' };

  const { start, end } = anchor;
  if (Number.isInteger(start) && Number.isInteger(end) && end > start && text.slice(start, end) === quote) {
    return { found: true, start, end, strategy: 'offsets' };
  }

  const matches = occurrencesOf(text, quote);
  if (!matches.length) return { found: false, strategy: 'none' };
  if (matches.length === 1) {
    return { found: true, start: matches[0], end: matches[0] + quote.length, strategy: 'unique' };
  }

  const prefix = typeof anchor.prefix === 'string' ? anchor.prefix : '';
  const suffix = typeof anchor.suffix === 'string' ? anchor.suffix : '';
  let best = matches[0];
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const at of matches) {
    const score = contextScore(text, at, quote, prefix, suffix);
    const distance = Number.isInteger(start) ? Math.abs(at - start) : 0;
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = at;
      bestScore = score;
      bestDistance = distance;
    }
  }
  // Several candidates and not one of them backed by the saved context: picking the
  // nearest offset would silently send the reader to the wrong paragraph, which is worse
  // than admitting the anchor is stale.
  if (bestScore <= 0) return { found: false, strategy: 'none' };
  return { found: true, start: best, end: best + quote.length, strategy: 'context' };
}

/** The `text` field Obsidian's own Canvas renders when it does not know about kcExcerpt. */
export function excerptTextFromQuote(quote) {
  return String(quote ?? '')
    .split('\n')
    .map((line) => `> ${line.trim()}`.trimEnd())
    .join('\n');
}
