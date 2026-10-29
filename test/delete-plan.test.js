import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeDelete,
  classifySelection,
  extractCanvasFileReferences,
  listRemovalTargets,
  planTrashTargets,
  revalidateTrashTargets,
  summarizeTrash,
} from '../src/delete-plan.js';
import { validateExcerptAnchor } from '../src/excerpt-anchor.js';

const card = (id, file, x = 0, y = 0) => ({ id, type: 'file', file, x, y, width: 320, height: 220 });
const group = (id, members, x = 0, y = 0) => ({ id, type: 'group', x, y, width: 600, height: 300, members });

test('blocks trash when another canvas references the source', () => {
  const node = card('a', 'A.md');
  const board = { nodes: [node], edges: [] };
  const result = analyzeDelete(board, new Set(['a']), [
    { path: 'Current.canvas', board },
    { path: 'Other.canvas', board: { nodes: [{ ...node, id: 'x' }], edges: [] } },
  ]);
  assert.deepEqual(result.filePaths, ['A.md']);
  assert.deepEqual(result.blockedTrash[0].references, ['Other.canvas']);
});

// The extracted representation is what collectCanvasDocuments actually hands over, so the
// guard has to work on that shape and not only on a hand-built board object.
test('blocks trash through the real extraction boundary', () => {
  const current = { nodes: [card('a', 'Shared.md')], edges: [] };
  const otherRaw = JSON.stringify({ nodes: [card('z', 'Shared.md')], edges: [] });
  const documents = [
    { path: 'Current.canvas', board: current },
    { path: 'Other.canvas', nodes: extractCanvasFileReferences(otherRaw) },
  ];
  const plan = analyzeDelete(current, new Set(['a']), documents, { currentPath: 'Current.canvas' });
  assert.deepEqual(plan.blockedTrash, [{ path: 'Shared.md', references: ['Other.canvas'] }]);
  assert.equal(planTrashTargets(plan).disabled, true);
  assert.deepEqual(planTrashTargets(plan).paths, ['Shared.md']);
});

test('the extracted representation survives the boundary unchanged', () => {
  const raw = JSON.stringify({ nodes: [card('z', 'Shared.md'), { id: 't', type: 'text', text: 'hi' }], edges: [] });
  const nodes = extractCanvasFileReferences(raw);
  assert.deepEqual(nodes, [{ id: 'z', file: 'Shared.md' }]);
  const plan = analyzeDelete({ nodes: [], edges: [] }, new Set(), [{ path: 'Other.canvas', nodes }], { currentPath: 'Current.canvas' });
  assert.deepEqual(plan.uncertain, []);
});

test('non-Markdown file nodes never count as a Markdown reference', () => {
  const raw = JSON.stringify({ nodes: [{ id: 'p', type: 'file', file: 'image.png', x: 0, y: 0, width: 1, height: 1 }], edges: [] });
  assert.deepEqual(extractCanvasFileReferences(raw), []);
});

test('classifies a mixed selection into board nodes and relations', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [{ id: 'e', fromNode: 'a', toNode: 'a' }] };
  assert.deepEqual(classifySelection(board, new Set(['a', 'e'])), { nodeIds: ['a'], edgeIds: ['e'] });
  assert.deepEqual(classifySelection(board, new Set(['e'])), { nodeIds: [], edgeIds: ['e'] });
  assert.deepEqual(classifySelection(board, new Set(['a'])), { nodeIds: ['a'], edgeIds: [] });
  assert.deepEqual(classifySelection(board, new Set(['missing'])), { nodeIds: [], edgeIds: [] });
});

test('a relation-only selection carries no Markdown source to guard', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [{ id: 'e', fromNode: 'a', toNode: 'a' }] };
  const plan = analyzeDelete(board, new Set(['e']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(plan.nodeIds, []);
  assert.deepEqual(plan.edgeIds, ['e']);
  assert.deepEqual(plan.filePaths, []);
  assert.equal(planTrashTargets(plan).disabled, true);
});

test('board-only removal is always available and never mutates the board', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [{ id: 'e', fromNode: 'a', toNode: 'a' }] };
  const snapshot = JSON.stringify(board);
  const result = analyzeDelete(board, new Set(['a']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(result.nodeIds, ['a']);
  assert.deepEqual(result.filePaths, ['A.md']);
  assert.deepEqual(result.blockedTrash, []);
  assert.deepEqual(result.uncertain, []);
  assert.equal(JSON.stringify(board), snapshot);
});

test('a second card on the same board also blocks trashing the source', () => {
  const board = { nodes: [card('a', 'A.md'), card('b', 'A.md', 400)], edges: [] };
  const result = analyzeDelete(board, new Set(['a']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(result.filePaths, ['A.md']);
  assert.deepEqual(result.blockedTrash, [{ path: 'A.md', references: ['Current.canvas'] }]);
});

test('an unreadable or unparseable canvas makes the plan uncertain', () => {
  const board = { nodes: [card('a', 'A.md')], edges: [] };
  const result = analyzeDelete(board, new Set(['a']), [
    { path: 'Current.canvas', board },
    { path: 'Broken.canvas', error: new Error('permission denied') },
  ]);
  assert.deepEqual(result.uncertain, [{ path: 'Broken.canvas', reason: 'permission denied' }]);
  assert.equal(planTrashTargets(result).disabled, true);
});

test('a missing source file is never a trash target', () => {
  const board = { nodes: [card('a', 'Gone.md'), card('b', 'Here.md', 400)], edges: [] };
  const result = analyzeDelete(board, new Set(['a', 'b']), [{ path: 'Current.canvas', board }], {
    isMissing: (path) => path === 'Gone.md',
  });
  assert.deepEqual(result.missingPaths, ['Gone.md']);
  assert.deepEqual(planTrashTargets(result).paths, ['Here.md']);
});

test('a group-only removal offers no source deletion', () => {
  const board = { nodes: [group('g', ['a', 'b']), card('a', 'A.md'), card('b', 'B.md', 400)], edges: [] };
  const result = analyzeDelete(board, new Set(['g']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(result.nodeIds, ['g']);
  assert.deepEqual(result.filePaths, []);
  const targets = planTrashTargets(result);
  assert.equal(targets.disabled, true);
  assert.deepEqual(targets.paths, []);
});

test('trash is offered only when every source is provably unreferenced', () => {
  const board = { nodes: [card('a', 'A.md'), card('b', 'B.md', 400)], edges: [] };
  const clean = analyzeDelete(board, new Set(['a', 'b']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(planTrashTargets(clean), { paths: ['A.md', 'B.md'], disabled: false, reason: '' });

  const blocked = analyzeDelete(board, new Set(['a']), [
    { path: 'Current.canvas', board },
    { path: 'Other.canvas', nodes: [card('z', 'A.md')] },
  ]);
  const targets = planTrashTargets(blocked);
  assert.equal(targets.disabled, true);
  assert.match(targets.reason, /Other\.canvas/);
});

test('summarizes exactly which sources reached the trash and which did not', () => {
  const summary = summarizeTrash([
    { path: 'A.md', ok: true },
    { path: 'B.md', ok: false, reason: 'permission denied' },
  ]);
  assert.deepEqual(summary.deleted, ['A.md']);
  assert.deepEqual(summary.failed, [{ path: 'B.md', reason: 'permission denied' }]);
  assert.match(summary.message, /A\.md/);
  assert.match(summary.message, /B\.md/);
});

test('lists at most five file names in the confirmation', () => {
  const many = { filePaths: ['1.md', '2.md', '3.md', '4.md', '5.md', '6.md', '7.md'] };
  assert.deepEqual(listRemovalTargets(many), { names: ['1.md', '2.md', '3.md', '4.md', '5.md'], extra: 2 });
  assert.deepEqual(listRemovalTargets({ filePaths: ['1.md'] }), { names: ['1.md'], extra: 0 });
  assert.deepEqual(listRemovalTargets({ filePaths: [] }), { names: [], extra: 0 });
});

const excerpt = (id, sourceFile, quote, x = 0, y = 0) => ({
  id, type: 'text', text: `> ${quote}`, x, y, width: 320, height: 180,
  kcExcerpt: { version: 1, sourceFile, quote, start: 0, end: quote.length, prefix: '', suffix: '' },
});

test('an excerpt on another canvas blocks trashing the source file', () => {
  const current = { nodes: [card('a', 'Shared.md')], edges: [] };
  const otherRaw = JSON.stringify({ nodes: [excerpt('x', 'Shared.md', '引用')], edges: [] });
  const plan = analyzeDelete(current, new Set(['a']), [
    { path: 'Current.canvas', board: current },
    { path: 'Other.canvas', nodes: extractCanvasFileReferences(otherRaw) },
  ], { currentPath: 'Current.canvas' });
  assert.deepEqual(plan.blockedTrash, [{ path: 'Shared.md', references: ['Other.canvas'] }]);
  assert.equal(planTrashTargets(plan).disabled, true);
});

test('an excerpt on the same canvas blocks trashing the source file', () => {
  const board = { nodes: [card('a', 'Shared.md'), excerpt('e', 'Shared.md', '引用', 400)], edges: [] };
  const plan = analyzeDelete(board, new Set(['a']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(plan.blockedTrash, [{ path: 'Shared.md', references: ['Current.canvas'] }]);
});

test('the excerpt being removed does not block its own source', () => {
  const board = { nodes: [card('a', 'A.md'), excerpt('e', 'A.md', '引用', 400)], edges: [] };
  const plan = analyzeDelete(board, new Set(['a', 'e']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(plan.blockedTrash, []);
  assert.deepEqual(plan.filePaths, ['A.md']);
  assert.deepEqual(planTrashTargets(plan).paths, ['A.md']);
  assert.equal(planTrashTargets(plan).disabled, false);
});

test('removing only an excerpt never offers source deletion', () => {
  const board = { nodes: [card('a', 'A.md'), excerpt('e', 'A.md', '引用', 400)], edges: [] };
  const plan = analyzeDelete(board, new Set(['e']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(plan.filePaths, []);
  const targets = planTrashTargets(plan);
  assert.equal(targets.disabled, true);
  assert.deepEqual(targets.paths, []);
});

test('the extraction boundary reports excerpt sources too', () => {
  const raw = JSON.stringify({
    nodes: [
      card('f', 'A.md'),
      excerpt('e', 'Notes/Book.md', '复利'),
      { id: 't', type: 'text', text: '普通文本卡', x: 0, y: 0, width: 10, height: 10 },
    ],
    edges: [],
  });
  assert.deepEqual(extractCanvasFileReferences(raw), [
    { id: 'f', file: 'A.md' },
    { id: 'e', file: 'Notes/Book.md' },
  ]);
});

const excerptWithForeignFile = {
  id: 'x', type: 'text', text: '> 引文', x: 0, y: 0, width: 320, height: 180,
  file: 'assets/image.png',
  kcExcerpt: { version: 1, sourceFile: 'A.md', quote: '引文', start: 0, end: 2, prefix: '', suffix: '' },
};

test('a node whose file field is not Markdown still reports its excerpt source', () => {
  const raw = JSON.stringify({ nodes: [excerptWithForeignFile], edges: [] });
  assert.deepEqual(extractCanvasFileReferences(raw), [{ id: 'x', file: 'A.md' }]);
});

test('an excerpt hidden behind a non-Markdown file field still blocks source deletion', () => {
  const current = { nodes: [card('a', 'A.md')], edges: [] };
  const otherRaw = JSON.stringify({ nodes: [excerptWithForeignFile], edges: [] });
  const plan = analyzeDelete(current, new Set(['a']), [
    { path: 'Current.canvas', board: current },
    { path: 'Other.canvas', nodes: extractCanvasFileReferences(otherRaw) },
  ], { currentPath: 'Current.canvas' });
  assert.deepEqual(plan.blockedTrash, [{ path: 'A.md', references: ['Other.canvas'] }]);
  assert.equal(planTrashTargets(plan).disabled, true);
});

test('every Markdown reference a node carries is reported, not just the first', () => {
  const raw = JSON.stringify({ nodes: [{ ...excerptWithForeignFile, file: 'Decoy.md' }], edges: [] });
  assert.deepEqual(extractCanvasFileReferences(raw), [
    { id: 'x', file: 'Decoy.md' },
    { id: 'x', file: 'A.md' },
  ]);
});

test('an excerpt cannot be hidden behind a decoy Markdown file field', () => {
  const current = { nodes: [card('a', 'A.md')], edges: [] };
  const otherRaw = JSON.stringify({ nodes: [{ ...excerptWithForeignFile, file: 'Decoy.md' }], edges: [] });
  const plan = analyzeDelete(current, new Set(['a']), [
    { path: 'Current.canvas', board: current },
    { path: 'Other.canvas', nodes: extractCanvasFileReferences(otherRaw) },
  ], { currentPath: 'Current.canvas' });
  assert.deepEqual(plan.blockedTrash, [{ path: 'A.md', references: ['Other.canvas'] }]);
  assert.equal(planTrashTargets(plan).disabled, true);
});

test('a sourceFile the validator accepts is never ignored by the reference scan', () => {
  const cases = ['A.md', 'Notes/A.md', 'A.md ', '  A.md  ', 'A.MD', 'image.png', 'A', '', '   '];
  for (const sourceFile of cases) {
    const anchor = { version: 1, sourceFile, quote: '引文', start: 0, end: 2, prefix: '', suffix: '' };
    const accepted = validateExcerptAnchor(anchor) === null;
    const scanned = extractCanvasFileReferences(JSON.stringify({
      nodes: [{ id: 'x', type: 'text', text: '> 引文', x: 0, y: 0, width: 320, height: 180, kcExcerpt: anchor }],
      edges: [],
    }));
    if (accepted) {
      assert.ok(scanned.length > 0, `validator accepted but the scan ignored ${JSON.stringify(sourceFile)}`);
    } else {
      assert.deepEqual(scanned, [], `validator rejected but the scan reported ${JSON.stringify(sourceFile)}`);
    }
  }
});

test('the scan reports the normalized Markdown path', () => {
  const raw = JSON.stringify({
    nodes: [{
      id: 'x', type: 'text', text: '> 引文', x: 0, y: 0, width: 320, height: 180,
      kcExcerpt: { version: 1, sourceFile: 'A.md ', quote: '引文', start: 0, end: 2, prefix: '', suffix: '' },
    }],
    edges: [],
  });
  assert.deepEqual(extractCanvasFileReferences(raw), [{ id: 'x', file: 'A.md' }]);
});

test('a padded sourceFile still blocks trashing the note it points at', () => {
  const current = { nodes: [card('a', 'A.md')], edges: [] };
  const padded = { ...excerptWithForeignFile, file: undefined, kcExcerpt: { ...excerptWithForeignFile.kcExcerpt, sourceFile: 'A.md ' } };
  const plan = analyzeDelete(current, new Set(['a']), [
    { path: 'Current.canvas', board: current },
    { path: 'Other.canvas', nodes: extractCanvasFileReferences(JSON.stringify({ nodes: [padded], edges: [] })) },
  ], { currentPath: 'Current.canvas' });
  assert.equal(planTrashTargets(plan).disabled, true);
});

test('reads file references from any canvas without touching unsupported node types', () => {
  const raw = JSON.stringify({
    nodes: [
      { id: 't', type: 'text', text: 'hi', x: 0, y: 0, width: 1, height: 1 },
      { id: 'f', type: 'file', file: 'A.md', x: 0, y: 0, width: 1, height: 1 },
      { id: 'l', type: 'link', url: 'https://example.com', x: 0, y: 0, width: 1, height: 1 },
    ],
    edges: [],
  });
  assert.deepEqual(extractCanvasFileReferences(raw), [{ id: 'f', file: 'A.md' }]);
  assert.throws(() => extractCanvasFileReferences('{oops'), /解析/);
  assert.throws(() => extractCanvasFileReferences('{"edges":[]}'), /解析/);
});

test('a routed relation is still removable on its own, with no source file involved', () => {
  const board = {
    nodes: [card('a', 'A.md'), card('b', 'B.md', 400)],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b', fromEnd: 'none', toEnd: 'arrow', kcRoute: 'elbow' }],
  };
  assert.deepEqual(classifySelection(board, new Set(['e'])), { nodeIds: [], edgeIds: ['e'] });
  const plan = analyzeDelete(board, new Set(['e']), [{ path: 'Current.canvas', board }]);
  assert.deepEqual(plan.filePaths, []);
  const targets = planTrashTargets(plan);
  assert.equal(targets.disabled, true);
  assert.deepEqual(targets.paths, []);
});

test('a trash target that another canvas referenced after confirmation is blocked', () => {
  const documents = [
    { path: 'Canvas/A.canvas', board: { nodes: [card('a1', 'Notes/X.md')] } },
    { path: 'Canvas/B.canvas', board: { nodes: [card('b1', 'Notes/X.md')] } },
    { path: 'Canvas/C.canvas', board: { nodes: [] } },
  ];
  const result = revalidateTrashTargets(['Notes/X.md', 'Notes/Y.md'], documents);
  assert.deepEqual(result.allowed, ['Notes/Y.md']);
  assert.deepEqual(result.blocked, [{ path: 'Notes/X.md', references: ['Canvas/A.canvas', 'Canvas/B.canvas'], reason: 'referenced' }]);
});

test('an unreadable canvas makes every trash target uncertain', () => {
  const documents = [
    { path: 'Canvas/A.canvas', nodes: [] },
    { path: 'Canvas/Broken.canvas', error: new Error('画布无法解析') },
  ];
  const result = revalidateTrashTargets(['Notes/X.md'], documents);
  assert.deepEqual(result.allowed, []);
  assert.equal(result.blocked[0].path, 'Notes/X.md');
  assert.equal(result.blocked[0].reason, 'uncertain');
  assert.deepEqual(result.blocked[0].references, ['Canvas/Broken.canvas']);
  assert.equal(result.uncertain.length, 1);
});

test('duplicate targets are validated once', () => {
  const result = revalidateTrashTargets(['Notes/X.md', 'Notes/X.md'], [{ path: 'Canvas/A.canvas', nodes: [] }]);
  assert.deepEqual(result.allowed, ['Notes/X.md']);
});
