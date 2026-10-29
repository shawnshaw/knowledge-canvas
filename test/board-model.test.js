import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEdgeRoute } from '../src/edge-geometry.js';
import {
  COLLAPSED_HEIGHT,
  EXCERPT_SIZE,
  GROUP_PADDING,
  cardSearchText,
  createBoard,
  createEdge,
  createExcerptNode,
  createFileNode,
  createGroup,
  createStickyNode,
  isCardNode,
  isExcerptNode,
  isFileNode,
  isGroupNode,
  moveGroup,
  parseBoard,
  reflowGroup,
  removeFromBoard,
  renderedNodeHeight,
  restoreGeometry,
  setCardColor,
  setCollapsed,
  setEdgeRoute,
  snapshotGeometry,
  ungroup,
  updateFilePath,
} from '../src/board-model.js';

test('creates Markdown-backed JSON Canvas nodes and unlabeled edges', () => {
  const board = createBoard();
  const a = createFileNode('Inbox/A.md', { x: 20, y: 40 });
  const b = createFileNode('Books/B.md', { x: 420, y: 40 });
  board.nodes.push(a, b);
  board.edges.push(createEdge(a, b));
  assert.equal(board.nodes[0].type, 'file');
  assert.equal(board.edges[0].label, undefined);
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
});

test('rejects an edge that references a missing node', () => {
  assert.throws(
    () => parseBoard(JSON.stringify({ nodes: [], edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }] })),
    /missing node/i,
  );
});

test('rejects non-Markdown file nodes and unsupported edge ends', () => {
  assert.throws(() => parseBoard(JSON.stringify({ nodes: [{ id: 'a', type: 'file', file: 'A.pdf', x: 0, y: 0, width: 1, height: 1 }], edges: [] })), /Markdown/i);
  const nodes = [
    { id: 'a', type: 'file', file: 'A.md', x: 0, y: 0, width: 1, height: 1 },
    { id: 'b', type: 'file', file: 'B.md', x: 0, y: 0, width: 1, height: 1 },
  ];
  assert.throws(() => parseBoard(JSON.stringify({ nodes, edges: [{ id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'diamond', toEnd: 'arrow' }] })), /edge end/i);
});

test('updates moved Markdown references without changing layout', () => {
  const board = { nodes: [{ id: 'a', type: 'file', file: 'Old.md', x: 12, y: 34, width: 320, height: 220 }], edges: [] };
  assert.equal(updateFilePath(board, 'Old.md', 'Folder/New.md'), true);
  assert.deepEqual(board.nodes[0], { id: 'a', type: 'file', file: 'Folder/New.md', x: 12, y: 34, width: 320, height: 220 });
});

test('removes nodes and incident edges only from the board model', () => {
  const board = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }] };
  removeFromBoard(board, new Set(['a']));
  assert.deepEqual(board, { nodes: [{ id: 'b' }], edges: [] });
});

const card = (id, file, x = 0, y = 0, size = { width: 200, height: 180 }) => ({ id, type: 'file', file, x, y, ...size });
const groupNode = (id, members, label) => ({
  id, type: 'group', x: 0, y: 0, width: 600, height: 300, members, ...(label === undefined ? {} : { label }),
});

test('exposes file and group type guards', () => {
  assert.equal(isFileNode(card('a', 'A.md')), true);
  assert.equal(isFileNode(groupNode('g', [])), false);
  assert.equal(isFileNode(null), false);
  assert.equal(isGroupNode(groupNode('g', [])), true);
  assert.equal(isGroupNode(card('a', 'A.md')), false);
  assert.equal(isGroupNode(undefined), false);
});

test('validates collapsed file nodes and explicit non-nested groups', () => {
  const board = { nodes: [
    groupNode('g', ['a', 'b']),
    card('a', 'A.md', 32, 32, { width: 200, height: 180 }),
    card('b', 'B.md', 250, 32, { width: 200, height: 180 }),
  ], edges: [] };
  board.nodes[1].collapsed = true;
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.equal(renderedNodeHeight(board.nodes[1]), COLLAPSED_HEIGHT);
  assert.equal(renderedNodeHeight(board.nodes[2]), 180);
  assert.equal(renderedNodeHeight(board.nodes[0]), 300);
});

test('rejects duplicate group membership', () => {
  const file = card('a', 'A.md');
  const group = (id) => ({ id, type: 'group', x: 0, y: 0, width: 300, height: 250, members: ['a'] });
  assert.throws(() => parseBoard({ nodes: [file, group('g1'), group('g2')], edges: [] }), /more than one group/i);
});

test('rejects geometry that is not finite and positive', () => {
  const node = card('a', 'A.md');
  assert.throws(() => parseBoard({ nodes: [{ ...node, width: 0 }], edges: [] }), /geometry/i);
  assert.throws(() => parseBoard({ nodes: [{ ...node, height: Number.POSITIVE_INFINITY }], edges: [] }), /geometry/i);
  assert.throws(() => parseBoard({ nodes: [{ ...node, x: 'nope' }], edges: [] }), /geometry/i);
});

test('rejects group members that are not cards on the same canvas', () => {
  const file = card('a', 'A.md');
  assert.throws(
    () => parseBoard({ nodes: [file, groupNode('g2', []), groupNode('g1', ['g2'])], edges: [] }),
    /members must reference cards/i,
  );
  assert.throws(
    () => parseBoard({ nodes: [file, groupNode('g1', ['missing'])], edges: [] }),
    /members must reference cards/i,
  );
  assert.throws(() => parseBoard({ nodes: [file, groupNode('g1', ['a', 'a'])], edges: [] }), /duplicate/i);
});

test('rejects edges that touch a group', () => {
  const board = { nodes: [groupNode('g', ['a', 'b']), card('a', 'A.md'), card('b', 'B.md', 300, 0)], edges: [] };
  assert.throws(
    () => parseBoard({ ...board, edges: [{ id: 'e', fromNode: 'a', toNode: 'g' }] }),
    /cards/i,
  );
});

test('creates a padded group node around its members', () => {
  const a = card('a', 'A.md', 100, 50);
  const b = card('b', 'B.md', 340, 50);
  const group = createGroup([a, b], '  复利相关  ');
  assert.equal(group.type, 'group');
  assert.equal(group.label, '复利相关');
  assert.deepEqual(group.members, ['a', 'b']);
  assert.equal(group.x, 100 - GROUP_PADDING);
  assert.equal(group.y, 50 - GROUP_PADDING);
  assert.equal(group.width, b.x + b.width - a.x + GROUP_PADDING * 2);
  assert.equal(group.height, 180 + GROUP_PADDING * 2);
  assert.equal(typeof group.id, 'string');
  assert.equal('label' in createGroup([a, b], '   '), false);
  assert.throws(() => createGroup([a], '组'), /at least two/i);
});

test('reflows the group frame after a member moves or collapses', () => {
  const tall = card('a', 'A.md', 100, 50, { width: 200, height: 400 });
  const short = card('b', 'B.md', 340, 50);
  const group = createGroup([tall, short], '');
  const board = { nodes: [group, tall, short], edges: [] };
  assert.equal(group.height, 400 + GROUP_PADDING * 2);

  short.x = 600;
  assert.equal(reflowGroup(board, group.id), true);
  assert.equal(group.width, 800 - 100 + GROUP_PADDING * 2);

  setCollapsed(board, 'a', true);
  assert.equal(group.height, 180 + GROUP_PADDING * 2);
  assert.equal(reflowGroup(board, 'missing'), false);
});

test('moving a group moves the frame and each member exactly once', () => {
  const a = card('a', 'A.md', 100, 50);
  const b = card('b', 'B.md', 340, 50);
  const group = createGroup([a, b], '');
  const board = { nodes: [group, a, b], edges: [] };
  assert.equal(moveGroup(board, group.id, 40, -10), true);
  assert.deepEqual([group.x, group.y], [100 - GROUP_PADDING + 40, 50 - GROUP_PADDING - 10]);
  assert.deepEqual([a.x, a.y], [140, 40]);
  assert.deepEqual([b.x, b.y], [380, 40]);
  assert.equal(moveGroup(board, 'missing', 1, 1), false);
});

test('ungrouping preserves cards, relations, and Markdown references', () => {
  const a = card('a', 'A.md', 100, 50);
  const b = card('b', 'B.md', 340, 50);
  const group = createGroup([a, b], '组');
  const edge = { id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow' };
  const board = { nodes: [group, a, b], edges: [edge] };
  assert.equal(ungroup(board, group.id), true);
  assert.deepEqual(board.nodes.map((node) => node.id), ['a', 'b']);
  assert.deepEqual(board.edges, [edge]);
  assert.equal(board.nodes[0].file, 'A.md');
  assert.equal(ungroup(board, 'missing'), false);
});

test('removing a member prunes membership and drops undersized groups', () => {
  const a = card('a', 'A.md');
  const b = card('b', 'B.md', 300, 0);
  const c = card('c', 'C.md', 600, 0);
  const group = createGroup([a, b, c], '');
  const board = { nodes: [group, a, b, c], edges: [] };

  removeFromBoard(board, new Set(['c']));
  assert.deepEqual(group.members, ['a', 'b']);

  removeFromBoard(board, new Set(['b']));
  assert.deepEqual(board.nodes.map((node) => node.id), ['a']);
});

test('removing a group keeps its member cards', () => {
  const a = card('a', 'A.md');
  const b = card('b', 'B.md', 300, 0);
  const group = createGroup([a, b], '');
  const edge = { id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow' };
  const board = { nodes: [group, a, b], edges: [edge] };

  removeFromBoard(board, new Set([group.id]));
  assert.deepEqual(board.nodes.map((node) => node.id), ['a', 'b']);
  assert.deepEqual(board.edges, [edge]);
});

test('restores a dragged member and re-derives its frame', () => {
  const a = card('a', 'A.md', 100, 50);
  const b = card('b', 'B.md', 340, 50);
  const group = createGroup([a, b], '');
  const board = { nodes: [group, a, b], edges: [] };
  const frame = { x: group.x, y: group.y, width: group.width, height: group.height };

  const snapshot = snapshotGeometry([a]);
  a.x += 500;
  a.y += 120;
  reflowGroup(board, group.id);
  assert.notDeepEqual({ x: group.x, y: group.y, width: group.width, height: group.height }, frame);

  assert.deepEqual([...restoreGeometry(board, snapshot)], ['a']);
  assert.deepEqual([a.x, a.y], [100, 50]);
  assert.deepEqual({ x: group.x, y: group.y, width: group.width, height: group.height }, frame);
});

test('a whole-group drag restores the frame and its members without recomputing the frame', () => {
  const a = card('a', 'A.md', 100, 50);
  const b = card('b', 'B.md', 340, 50);
  const group = createGroup([a, b], '');
  const board = { nodes: [group, a, b], edges: [] };
  const before = { group: { x: group.x, y: group.y, width: group.width, height: group.height }, a: [a.x, a.y], b: [b.x, b.y] };

  const snapshot = snapshotGeometry([group, a, b]);
  moveGroup(board, group.id, 60, -20);
  assert.deepEqual([group.x, group.y], [before.group.x + 60, before.group.y - 20]);

  restoreGeometry(board, snapshot);
  assert.deepEqual({ x: group.x, y: group.y, width: group.width, height: group.height }, before.group);
  assert.deepEqual([a.x, a.y], before.a);
  assert.deepEqual([b.x, b.y], before.b);
});

test('restores a resized card to its recorded size', () => {
  const a = card('a', 'A.md', 10, 20, { width: 320, height: 220 });
  const snapshot = snapshotGeometry([a]);
  a.width = 700;
  a.height = 90;
  restoreGeometry({ nodes: [a], edges: [] }, snapshot);
  assert.deepEqual([a.width, a.height], [320, 220]);
  assert.deepEqual([a.x, a.y], [10, 20]);
});

const anchorFor = (sourceFile, quote, overrides = {}) => ({
  version: 1, sourceFile, quote, start: 0, end: quote.length, prefix: '', suffix: '', ...overrides,
});
const excerpt = (id, sourceFile, quote, x = 0, y = 0) => ({
  id, type: 'text', text: `> ${quote}`, x, y, ...EXCERPT_SIZE, kcExcerpt: anchorFor(sourceFile, quote),
});

test('classifies file, excerpt, plain text, and group nodes', () => {
  assert.equal(isFileNode(card('a', 'A.md')), true);
  assert.equal(isExcerptNode(excerpt('e', 'A.md', '引用')), true);
  assert.equal(isExcerptNode({ id: 't', type: 'text', text: 'hi', x: 0, y: 0, width: 1, height: 1 }), false);
  assert.equal(isCardNode(card('a', 'A.md')), true);
  assert.equal(isCardNode(excerpt('e', 'A.md', '引用')), true);
  assert.equal(isCardNode({ id: 't', type: 'text', text: 'hi' }), true);
  assert.equal(isCardNode(groupNode('g', [])), false);
  assert.equal(isExcerptNode(null), false);
  assert.equal(isCardNode(undefined), false);
  assert.equal(isGroupNode(excerpt('e', 'A.md', '引用')), false);
});

test('creates an excerpt sticker as a standard JSON Canvas text node', () => {
  const anchor = anchorFor('Notes/Book.md', '复利', { start: 12, end: 14, prefix: '前', suffix: '后' });
  const node = createExcerptNode({ text: '> 复利', point: { x: 40, y: 60 }, anchor });
  assert.equal(node.type, 'text');
  assert.equal(node.text, '> 复利');
  assert.deepEqual([node.x, node.y], [40, 60]);
  assert.deepEqual([node.width, node.height], [EXCERPT_SIZE.width, EXCERPT_SIZE.height]);
  assert.deepEqual(node.kcExcerpt, anchor);
  assert.equal(typeof node.id, 'string');
  assert.deepEqual(parseBoard({ nodes: [node], edges: [] }), { nodes: [node], edges: [] });
});

test('keeps a valid excerpt sticker intact through a save/load round trip', () => {
  const board = { nodes: [excerpt('e', 'Notes/Book.md', '复利'), card('a', 'A.md', 400)], edges: [] };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
});

test('still opens a canvas that contains a plain native text node', () => {
  const board = { nodes: [{ id: 't', type: 'text', text: '普通文本卡', x: 0, y: 0, width: 200, height: 80 }], edges: [] };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.equal(isExcerptNode(board.nodes[0]), false);
});

test('a malformed kcExcerpt explains itself instead of crashing later', () => {
  const withAnchor = (kcExcerpt) => ({ nodes: [{ ...excerpt('e', 'A.md', '引用'), kcExcerpt }], edges: [] });
  const base = anchorFor('A.md', '引用');
  assert.throws(() => parseBoard(withAnchor({ ...base, sourceFile: '' })), /sourceFile/);
  assert.throws(() => parseBoard(withAnchor({ ...base, version: 9 })), /版本/);
  assert.throws(() => parseBoard(withAnchor({ ...base, quote: '   ' })), /quote/);
  assert.throws(() => parseBoard(withAnchor({ ...base, start: 5, end: 1 })), /start\/end/);
  assert.throws(() => parseBoard(withAnchor({ ...base, prefix: 3 })), /prefix\/suffix/);
  assert.throws(() => parseBoard(withAnchor(null)), /对象/);
});

test('excerpt stickers can join groups and carry relations', () => {
  const a = card('a', 'A.md');
  const e = excerpt('e', 'Notes/Book.md', '复利', 340);
  const group = createGroup([a, e], '复利相关');
  assert.deepEqual(group.members, ['a', 'e']);
  const board = { nodes: [group, a, e], edges: [{ id: 'x', fromNode: 'a', toNode: 'e', fromEnd: 'none', toEnd: 'arrow' }] };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.equal(reflowGroup(board, group.id), true);
});

test('a group still cannot contain a group and edges still cannot touch a group', () => {
  const a = card('a', 'A.md');
  const e = excerpt('e', 'Notes/Book.md', '复利', 340);
  assert.throws(
    () => parseBoard({ nodes: [a, e, groupNode('g2', []), groupNode('g1', ['g2'])], edges: [] }),
    /members must reference cards/i,
  );
  assert.throws(
    () => parseBoard({ nodes: [groupNode('g', ['a', 'e']), a, e], edges: [{ id: 'x', fromNode: 'a', toNode: 'g' }] }),
    /cards/i,
  );
});

test('an excerpt sticker collapses like any other card', () => {
  const e = excerpt('e', 'Notes/Book.md', '复利');
  const board = { nodes: [e], edges: [] };
  assert.equal(setCollapsed(board, 'e', true), true);
  assert.equal(e.collapsed, true);
  assert.equal(renderedNodeHeight(e), COLLAPSED_HEIGHT);
  assert.equal(setCollapsed(board, 'e', false), true);
  assert.equal(e.collapsed, undefined);
  assert.equal(renderedNodeHeight(e), EXCERPT_SIZE.height);
});

test('renaming a Markdown file also updates excerpt sources', () => {
  const board = { nodes: [card('a', 'Old.md'), excerpt('e', 'Old.md', '引用', 400)], edges: [] };
  assert.equal(updateFilePath(board, 'Old.md', 'New.md'), true);
  assert.equal(board.nodes[0].file, 'New.md');
  assert.equal(board.nodes[1].kcExcerpt.sourceFile, 'New.md');
  assert.equal(board.nodes[1].kcExcerpt.quote, '引用');
  assert.equal(updateFilePath(board, 'Old.md', 'Nope.md'), false);
});

test('search text covers both the quote and the source file', () => {
  assert.equal(cardSearchText(card('a', 'Inbox/A.md')), 'inbox/a.md');
  assert.equal(cardSearchText(excerpt('e', 'Notes/Book.md', '复利很重要')), '复利很重要 notes/book.md');
  assert.equal(cardSearchText({ id: 't', type: 'text', text: '普通文本' }), '普通文本');
  assert.equal(cardSearchText(groupNode('g', [])), '');
});

test('moving a group moves excerpt members too', () => {
  const a = card('a', 'A.md');
  const e = excerpt('e', 'Notes/Book.md', '复利', 340);
  const group = createGroup([a, e], '');
  const board = { nodes: [group, a, e], edges: [] };
  assert.equal(moveGroup(board, group.id, 10, 20), true);
  assert.deepEqual([e.x, e.y], [350, 20]);
});

test('removing an excerpt sticker prunes membership and edges only', () => {
  const a = card('a', 'A.md');
  const e = excerpt('e', 'Notes/Book.md', '复利', 340);
  const other = excerpt('e2', 'Notes/Book.md', '长期', 340, 300);
  const group = createGroup([a, e, other], '');
  const board = { nodes: [group, a, e, other], edges: [{ id: 'x', fromNode: 'e', toNode: 'e2', fromEnd: 'none', toEnd: 'arrow' }] };
  removeFromBoard(board, new Set(['e']));
  assert.deepEqual(group.members, ['a', 'e2']);
  assert.deepEqual(board.edges, []);
  assert.deepEqual(board.nodes.map((node) => node.id), [group.id, 'a', 'e2']);
});

test('accepts an approved card color and rejects anything else', () => {
  const colored = { ...card('a', 'A.md'), color: '3' };
  assert.deepEqual(parseBoard(JSON.stringify({ nodes: [colored], edges: [] })), { nodes: [colored], edges: [] });
  assert.throws(() => parseBoard({ nodes: [{ ...card('a', 'A.md'), color: '2' }], edges: [] }), /color/i);
  assert.throws(() => parseBoard({ nodes: [{ ...card('a', 'A.md'), color: 'red' }], edges: [] }), /color/i);
  assert.throws(() => parseBoard({ nodes: [{ ...card('a', 'A.md'), color: 3 }], edges: [] }), /color/i);
  // a hand-edited null reads as neutral instead of locking the board; we simply never write one
  assert.equal(parseBoard({ nodes: [{ ...card('a', 'A.md'), color: null }], edges: [] }).nodes[0].color, null);
});

test('a legacy board without any card color still opens', () => {
  const board = { nodes: [card('a', 'A.md'), excerpt('e', 'A.md', '引文', 400)], edges: [] };
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.equal('color' in board.nodes[0], false);
  assert.equal('color' in board.nodes[1], false);
});

test('setting a card color writes a preset and neutral removes the field', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [] };
  assert.equal(setCardColor(board, 'a', 'green'), true);
  assert.equal(board.nodes[0].color, '4');
  assert.deepEqual(parseBoard(board), board);
  assert.equal(setCardColor(board, 'a', 'neutral'), true);
  assert.equal('color' in board.nodes[0], false);
  assert.equal(setCardColor(board, 'missing', 'blue'), false);
});

test('setting a color on something that is not a card is refused', () => {
  const board = { nodes: [card('a', 'A.md'), groupNode('g', []), excerpt('e', 'A.md', '引文', 400)], edges: [] };
  assert.equal(setCardColor(board, 'g', 'blue'), false);
  assert.equal('color' in board.nodes[1], false);
  assert.equal(setCardColor(board, 'e', 'purple'), true);
  assert.equal(board.nodes[2].color, '6');
});

test('an unrecognised color request never writes an invalid value', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [] };
  assert.equal(setCardColor(board, 'a', 'chartreuse'), true);
  assert.equal('color' in board.nodes[0], false);
});

test('a sticky node always carries one of the five presets, decided at creation', () => {
  const node = createStickyNode('Inbox/Canvas/想法.md', { x: 12, y: 34 }, () => 0);
  assert.equal(node.type, 'file');
  assert.equal(node.color, '1');
  assert.deepEqual([node.x, node.y], [12, 34]);
  assert.equal(createStickyNode('A.md', { x: 0, y: 0 }, () => 0.99).color, '6');
  // an ordinary imported file card stays neutral
  assert.equal('color' in createFileNode('B.md', { x: 0, y: 0 }), false);
});

const routedBoard = (extra = {}) => ({
  nodes: [card('a', 'A.md'), card('b', 'B.md', 400)],
  edges: [{ id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow', ...extra }],
});

test('accepts an approved connector route and rejects anything else', () => {
  const board = routedBoard({ kcRoute: 'elbow' });
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  for (const kcRoute of ['zigzag', 'CURVE', 3, {}]) {
    assert.throws(() => parseBoard(routedBoard({ kcRoute })), /route/i);
  }
  // a hand-edited null reads as the default rather than locking the board
  assert.equal(parseBoard(routedBoard({ kcRoute: null })).edges[0].kcRoute, null);
});

test('a legacy relation without a route still opens', () => {
  const board = routedBoard();
  assert.deepEqual(parseBoard(JSON.stringify(board)), board);
  assert.equal('kcRoute' in board.edges[0], false);
  assert.equal(normalizeEdgeRoute(undefined), 'curve');
});

test('setting a relation route writes approved values and drops the default', () => {
  const board = routedBoard();
  assert.equal(setEdgeRoute(board, 'e', 'elbow'), true);
  assert.equal(board.edges[0].kcRoute, 'elbow');
  assert.deepEqual(parseBoard(board), board);
  // curve is the default, so persisting it means writing no field at all
  assert.equal(setEdgeRoute(board, 'e', 'curve'), true);
  assert.equal('kcRoute' in board.edges[0], false);
  assert.equal(setEdgeRoute(board, 'e', 'zigzag'), true);
  assert.equal('kcRoute' in board.edges[0], false);
  assert.equal(setEdgeRoute(board, 'missing', 'curve'), false);
});

test('a legacy board without kcMeta still opens', () => {
  const board = createBoard();
  const parsed = parseBoard(JSON.stringify(board));
  assert.deepEqual(parsed, { nodes: [], edges: [] });
});

test('a board with valid kcMeta keeps it', () => {
  const board = { ...createBoard(), kcMeta: { version: 1, noteFolder: 'Inbox/Canvas/读书' } };
  assert.deepEqual(parseBoard(JSON.stringify(board)).kcMeta, board.kcMeta);
});

test('a board with malformed kcMeta is refused', () => {
  assert.throws(() => parseBoard(JSON.stringify({ nodes: [], edges: [], kcMeta: { version: 9 } })), /画布扩展信息无效/);
  assert.throws(() => parseBoard(JSON.stringify({ nodes: [], edges: [], kcMeta: { version: 1, noteFolder: '/abs' } })), /画布扩展信息无效/);
});

test('restoring geometry resolves nodes by id after the board object was replaced', () => {
  const board = createBoard();
  board.nodes.push(createFileNode('A.md', { x: 10, y: 20 }), createFileNode('B.md', { x: 200, y: 20 }));
  const snapshot = snapshotGeometry(board.nodes);
  // Simulate a queued write installing a fresh board object with the same ids.
  const replacement = JSON.parse(JSON.stringify(board));
  for (const entry of snapshot) { entry.node.x += 90; entry.node.y += 90; }

  restoreGeometry(replacement, snapshot);
  assert.deepEqual(replacement.nodes.map((node) => ({ x: node.x, y: node.y })), [
    { x: 10, y: 20 },
    { x: 200, y: 20 },
  ]);
});
