import test from 'node:test';
import assert from 'node:assert/strict';
import { RelationSourceRequiredError, applyPromotion, previewPromotion } from '../src/relation-promotion.js';

const nodes = [
  { id: 'a', file: 'Inbox/A.md' },
  { id: 'b', file: 'Books/B.md' },
];
const files = {
  a: { content: '# A\n', mtime: 1 },
  b: { content: '# B\n', mtime: 2 },
};
const edge = { id: 'e', fromNode: 'a', toNode: 'b', label: '启发了', fromEnd: 'none', toEnd: 'arrow' };

test('previews a custom relation without modifying either file', () => {
  const preview = previewPromotion(edge, nodes, files);
  assert.equal(preview.changes[0].append, '- [[Books/B]] — 启发了');
  assert.equal(preview.changes[0].content, '# A\n\n## 相关链接\n\n- [[Books/B]] — 启发了\n');
  assert.equal(files.a.content, '# A\n');
});

test('does not append the same promoted relation twice', () => {
  const existing = { ...files, a: { content: '# A\n\n## 相关链接\n\n- [[Books/B]] — 启发了\n', mtime: 1 } };
  assert.equal(previewPromotion(edge, nodes, existing).changes.length, 0);
});

test('preserves all existing bytes around a related-links section', () => {
  const original = '# A\n\n## 相关链接\n\n- [[Existing]]\n\n## 尾部\n\n  保留空格  \n';
  const preview = previewPromotion(edge, nodes, { ...files, a: { content: original, mtime: 1 } });
  assert.equal(preview.changes[0].content, '# A\n\n## 相关链接\n\n- [[Existing]]\n\n- [[Books/B]] — 启发了\n\n## 尾部\n\n  保留空格  \n');
});

test('preserves trailing whitespace when adding the first related-links section', () => {
  const original = '# A\n\n正文  \n';
  const preview = previewPromotion(edge, nodes, { ...files, a: { content: original, mtime: 1 } });
  assert.equal(preview.changes[0].content, `${original}\n## 相关链接\n\n- [[Books/B]] — 启发了\n`);
});

test('supports empty labels and bidirectional edges', () => {
  const preview = previewPromotion({ ...edge, label: '', fromEnd: 'arrow' }, nodes, files);
  assert.deepEqual(preview.changes.map((change) => change.append), ['- [[Books/B]]', '- [[Inbox/A]]']);
});

test('requires an explicit source for an undirected edge', () => {
  const undirected = { ...edge, fromEnd: 'none', toEnd: 'none' };
  assert.throws(() => previewPromotion(undirected, nodes, files), RelationSourceRequiredError);
  assert.equal(previewPromotion(undirected, nodes, files, 'b').changes[0].append, '- [[Inbox/A]] — 启发了');
});

test('applies only a confirmed preview through the repository', async () => {
  const writes = [];
  await applyPromotion(previewPromotion(edge, nodes, files), { save: async (...args) => { writes.push(args); return { mtime: 3 }; } });
  assert.deepEqual(writes, [['Inbox/A.md', 1, '# A\n\n## 相关链接\n\n- [[Books/B]] — 启发了\n']]);
});
