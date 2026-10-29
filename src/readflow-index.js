/**
 * ReadFlow Atomic Markdown index. Reads nothing but Markdown text and its frontmatter;
 * ReadFlow's own plugin data, cookies, and sync state are never touched.
 */

import { toReadFlowCard } from './readflow-adapter.js';

function stringField(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

/**
 * Normalizes one Markdown file into an import candidate, or null when it is not
 * `type: highlight`. Book wikilinks are resolved for display only; the source file
 * is never rewritten.
 */
export function toReadFlowCandidate(file, content, frontmatter = {}) {
  const card = toReadFlowCard(file, content, frontmatter);
  if (!card) return null;
  return {
    path: file.path,
    title: card.title,
    excerpt: card.excerpt,
    comment: card.comment,
    book: card.book,
    chapter: card.chapter,
    status: stringField(frontmatter.status),
    created: stringField(frontmatter.created),
  };
}

/** Exact string filtering — no fuzzy matching, no dependency. */
export function filterReadFlowCandidates(candidates, { query = '', book = '', chapter = '', status = '' } = {}) {
  const needle = String(query).trim().toLowerCase();
  return (candidates ?? []).filter((candidate) => {
    if (book && candidate.book !== book) return false;
    if (chapter && candidate.chapter !== chapter) return false;
    if (status && candidate.status !== status) return false;
    if (!needle) return true;
    return candidate.excerpt.toLowerCase().includes(needle) || candidate.comment.toLowerCase().includes(needle);
  });
}

/**
 * Splits a selection into the cards that can be added and the ones already on this
 * board. Being present on another board is irrelevant, and duplicates inside one
 * batch collapse to their first occurrence.
 */
export function partitionReadFlowCandidates(candidates, existingPaths = []) {
  const existing = new Set(existingPaths);
  const seen = new Set();
  const added = [];
  const alreadyOnBoard = [];
  for (const candidate of candidates ?? []) {
    if (existing.has(candidate.path)) { alreadyOnBoard.push(candidate); continue; }
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    added.push(candidate);
  }
  return { added, alreadyOnBoard };
}
