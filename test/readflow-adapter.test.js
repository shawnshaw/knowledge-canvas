import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toReadFlowCard } from '../src/readflow-adapter.js';

const fixture = await readFile(new URL('./fixtures/readflow-highlight.md', import.meta.url), 'utf8');
const file = { path: 'ReadFlow/hl-1.md', basename: '纳瓦尔摘录' };

test('separates ReadFlow excerpt from personal comment', () => {
  const card = toReadFlowCard(file, fixture, { type: 'highlight', chapter: '财富', id: 'hl-1' });
  assert.deepEqual(card, {
    kind: 'readflow',
    title: '真正的财富不是用时间换钱。',
    excerpt: '真正的财富不是用时间换钱。',
    comment: '长期合作也会产生复利。',
    book: '纳瓦尔宝典',
    chapter: '财富',
    sourceId: 'hl-1',
  });
});

test('returns null for ordinary Markdown', () => {
  assert.equal(toReadFlowCard(file, '# 普通笔记', { type: 'note' }), null);
});

test('handles multiline quotes and absent comments', () => {
  const content = '---\ntype: highlight\nbook: "[[Books/A]]"\n---\n\n> 第一行\n> 第二行\n';
  assert.deepEqual(toReadFlowCard(file, content, { type: 'highlight' }), {
    kind: 'readflow', title: '第一行 第二行', excerpt: '第一行\n第二行', comment: '', book: 'A', chapter: '', sourceId: '',
  });
});
