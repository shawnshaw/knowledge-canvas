/**
 * Paragraph timestamps: a trailing HTML comment marker that records when a paragraph was
 * first marked and when its text last changed. The comment renders as nothing in Markdown,
 * so it never changes how the note looks.
 *
 * Pure and clock-injectable; nothing here reads or writes a file.
 */

export const MARKER_PREFIX = 'kc-time';

const MARKER_PATTERN = /^<!--\s*kc-time:\s*(\{[\s\S]*\})\s*-->\s*$/;
const FENCE_PATTERN = /^\s*(```|~~~)/;

function isIsoTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function toIso(now) {
  const value = typeof now === 'function' ? now() : now;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

/** Parses one marker line; returns null for any other line or a malformed payload. */
export function parseTimestampMarker(line) {
  const match = String(line ?? '').trim().match(MARKER_PATTERN);
  if (!match) return null;
  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!isIsoTimestamp(payload.createdAt)) return null;
  if (payload.updatedAt !== undefined && !isIsoTimestamp(payload.updatedAt)) return null;
  return payload.updatedAt ? { createdAt: payload.createdAt, updatedAt: payload.updatedAt } : { createdAt: payload.createdAt };
}

/** The canonical marker line for a payload. */
export function formatTimestampMarker(payload) {
  const body = payload.updatedAt
    ? { createdAt: payload.createdAt, updatedAt: payload.updatedAt }
    : { createdAt: payload.createdAt };
  return `<!-- ${MARKER_PREFIX}: ${JSON.stringify(body)} -->`;
}

function lineIndexAt(text, offset) {
  const limit = Math.max(0, Math.min(Number(offset) || 0, text.length));
  let line = 0;
  for (let index = 0; index < limit; index += 1) if (text[index] === '\n') line += 1;
  return line;
}

/**
 * Splits a document into paragraph blocks while skipping frontmatter, fenced code and the
 * markers themselves. Each marker attaches to the nearest preceding block, so a marker
 * separated from its paragraph by a blank line still belongs to it.
 *
 * @returns `{ lines, blocks }` where a block is
 * `{ startLine, endLine, text, marker: { line, createdAt, updatedAt? } | null }`.
 */
export function scanParagraphs(text) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  const markers = [];
  let inFrontmatter = false;
  let inFence = false;
  let current = null;

  const flush = () => {
    if (!current) return;
    current.text = lines.slice(current.startLine, current.endLine + 1).join('\n');
    blocks.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (index === 0 && line.trim() === '---') {
      inFrontmatter = true;
      flush();
      continue;
    }
    if (inFrontmatter) {
      if (line.trim() === '---') inFrontmatter = false;
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      flush();
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const marker = parseTimestampMarker(line);
    if (marker) {
      flush();
      markers.push({ line: index, ...marker });
      continue;
    }
    if (!current) current = { startLine: index, endLine: index, text: '', marker: null };
    else current.endLine = index;
  }
  flush();

  for (const marker of markers) {
    let target = null;
    for (const block of blocks) {
      if (block.endLine < marker.line) target = block;
      else break;
    }
    if (target && !target.marker) target.marker = marker;
  }
  return { lines, blocks };
}

/**
 * Adds a marker after the paragraph containing `cursor`. A cursor on a blank line, in
 * frontmatter or inside a fenced code block is refused, and a paragraph that already has
 * a marker is left untouched.
 *
 * @returns `{ text, added, marker }` or null when the cursor is not in a paragraph.
 */
export function addParagraphTimestamp(text, cursor, now = () => new Date()) {
  const { lines, blocks } = scanParagraphs(text);
  const line = lineIndexAt(String(text ?? ''), cursor);
  const block = blocks.find((candidate) => line >= candidate.startLine && line <= candidate.endLine);
  if (!block) return null;
  if (block.marker) return { text: String(text ?? ''), added: false, marker: block.marker };

  const marker = { createdAt: toIso(now) };
  let insertAt = block.endLine + 1;
  // Mirror the documented layout: the marker sits after the paragraph's trailing blank line.
  if (lines[insertAt] !== undefined && lines[insertAt].trim() === '') insertAt += 1;
  lines.splice(insertAt, 0, formatTimestampMarker(marker));
  return { text: lines.join('\n'), added: true, marker };
}

/**
 * Updates `updatedAt` for every marked paragraph whose text really changed between the
 * previously saved text and the text about to be saved. Untouched paragraphs, unmarked
 * paragraphs and new markers keep their existing timestamps; `createdAt` is never rewritten.
 *
 * @returns `{ text, updated }` — `text` is unchanged when nothing needs stamping.
 */
export function stampChangedParagraphs(nextText, previousText, now = () => new Date()) {
  const next = scanParagraphs(nextText);
  const previous = scanParagraphs(previousText);
  const before = new Map();
  for (const block of previous.blocks) {
    if (block.marker?.createdAt) before.set(block.marker.createdAt, block.text);
  }
  if (!before.size) return { text: nextText, updated: 0 };

  const iso = toIso(now);
  const lines = [...next.lines];
  let updated = 0;
  // Bottom-up so replacing a marker line never shifts a line index still to be visited.
  for (const block of [...next.blocks].sort((a, b) => b.startLine - a.startLine)) {
    const createdAt = block.marker?.createdAt;
    if (!createdAt || !before.has(createdAt)) continue;
    if (before.get(createdAt) === block.text) continue;
    lines[block.marker.line] = formatTimestampMarker({ createdAt, updatedAt: iso });
    updated += 1;
  }
  if (!updated) return { text: nextText, updated: 0 };
  return { text: lines.join('\n'), updated };
}
