import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOutline } from '../src/outline.js';
import {
  canPromoteToMarkdown,
  cardLabel,
  findCollapseTarget,
  groupDragMembers,
  outlineSelection,
} from '../src/card-queries.js';

const card = (id, file, x = 0, y = 0) => ({ id, type: 'file', file, x, y, width: 320, height: 220 });
const excerpt = (id, sourceFile, quote, x = 0, y = 0) => ({
  id, type: 'text', text: `> ${quote}`, x, y, width: 320, height: 180,
  kcExcerpt: { version: 1, sourceFile, quote, start: 0, end: quote.length, prefix: '', suffix: '' },
});
const textCard = (id, text = '原生文本卡', x = 0, y = 0) => ({ id, type: 'text', text, x, y, width: 200, height: 80 });
const group = (id, members, label) => ({ id, type: 'group', x: 0, y: 0, width: 600, height: 300, members, ...(label ? { label } : {}) });

test('labels every node kind without assuming a file field', () => {
  assert.equal(cardLabel(card('a', 'Inbox/复利.md')), '复利');
  assert.equal(cardLabel(excerpt('e', 'Notes/Book.md', '引文')), 'Book');
  assert.equal(cardLabel(textCard('t', '第一行\n第二行')), '第一行');
  assert.equal(cardLabel(textCard('t2', '   ')), '文本卡');
  assert.equal(cardLabel(group('g', [], '复利相关')), '复利相关');
  assert.equal(cardLabel(group('g2', [])), '分组');
  assert.equal(cardLabel(undefined), '');
  assert.equal(cardLabel(textCard('t3', 'x'.repeat(60))).length, 40);
  // a padded source path still labels as the note it points at
  const padded = { ...excerpt('p', 'Notes/Book.md', '引文'), kcExcerpt: { ...excerpt('p', 'Notes/Book.md', '引文').kcExcerpt, sourceFile: 'Notes/Book.md ' } };
  assert.equal(cardLabel(padded), 'Book');
});

test('collapse targets are cards, never group frames', () => {
  const board = { nodes: [card('a', 'A.md'), excerpt('e', 'B.md', '引文'), textCard('t'), group('g', ['a'])], edges: [] };
  assert.equal(findCollapseTarget(board, 'a').id, 'a');
  assert.equal(findCollapseTarget(board, 'e').id, 'e');
  assert.equal(findCollapseTarget(board, 't').id, 't');
  assert.equal(findCollapseTarget(board, 'g'), null);
  assert.equal(findCollapseTarget(board, 'missing'), null);
});

test('group drag carries file cards and excerpt stickers alike', () => {
  const a = card('a', 'A.md');
  const e = excerpt('e', 'Notes/Book.md', '引文', 400);
  const t = textCard('t', '原生', 700);
  const outsider = card('z', 'Z.md', 1200);
  const board = { nodes: [group('g', ['a', 'e']), a, e, t, outsider], edges: [] };
  assert.deepEqual(groupDragMembers(board, 'g').map((node) => node.id), ['g', 'a', 'e']);
  assert.deepEqual(groupDragMembers(board, 'missing'), []);
});

test('the outline only receives file cards and file-to-file relations', () => {
  const a = card('a', 'A.md');
  const b = card('b', 'B.md', 400);
  const e = excerpt('e', 'A.md', '引文', 800);
  const t = textCard('t', '原生', 1100);
  const board = {
    nodes: [a, b, e, t],
    edges: [
      { id: 'file-file', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow' },
      { id: 'file-excerpt', fromNode: 'b', toNode: 'e', fromEnd: 'none', toEnd: 'arrow' },
      { id: 'excerpt-text', fromNode: 'e', toNode: 't', fromEnd: 'none', toEnd: 'arrow' },
    ],
  };
  const selection = outlineSelection(board, board.nodes);
  assert.deepEqual(selection.nodes.map((node) => node.id), ['a', 'b']);
  assert.deepEqual(selection.edges.map((edge) => edge.id), ['file-file']);
});

test('an outline over file, excerpt, and plain text never throws', () => {
  const a = card('a', 'A.md');
  const b = card('b', 'B.md', 400);
  const e = excerpt('e', 'A.md', '引文', 800);
  const t = textCard('t', '原生文本', 1100);
  const board = {
    nodes: [a, b, e, t],
    edges: [
      { id: 'x', fromNode: 'a', toNode: 'e', fromEnd: 'none', toEnd: 'arrow' },
      { id: 'y', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow' },
    ],
  };
  const selection = outlineSelection(board, board.nodes);
  const outline = projectOutline(selection.nodes, selection.edges);
  assert.deepEqual(outline.roots.map((item) => item.nodeId), ['a']);
  assert.deepEqual(outline.crossReferences, []);
  assert.deepEqual(outline.items.map((item) => item.nodeId), ['a', 'b']);
  // every node the outline will render must produce a label without touching a missing field
  assert.deepEqual(outline.items.map((item) => cardLabel(item.node)), ['A', 'B']);
});

test('only file-to-file relations may be promoted to Markdown links', () => {
  const a = card('a', 'A.md');
  const b = card('b', 'B.md', 400);
  const e = excerpt('e', 'A.md', '引文', 800);
  const t = textCard('t', '原生', 1100);
  const board = { nodes: [a, b, e, t, group('g', ['a'])], edges: [] };
  const edge = (fromNode, toNode) => ({ id: `${fromNode}-${toNode}`, fromNode, toNode, fromEnd: 'none', toEnd: 'arrow' });
  assert.equal(canPromoteToMarkdown(board, edge('a', 'b')), true);
  assert.equal(canPromoteToMarkdown(board, edge('a', 'e')), false);
  assert.equal(canPromoteToMarkdown(board, edge('e', 't')), false);
  assert.equal(canPromoteToMarkdown(board, edge('a', 't')), false);
  assert.equal(canPromoteToMarkdown(board, edge('a', 'g')), false);
  assert.equal(canPromoteToMarkdown(board, edge('a', 'missing')), false);
});
