import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOutline } from '../src/outline.js';

const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const edge = (fromNode, toNode, fromEnd = 'none', toEnd = 'arrow') => ({ fromNode, toNode, fromEnd, toEnd });

test('keeps additional parents as cross-references instead of duplicating a node', () => {
  const outline = projectOutline(nodes, [edge('a', 'c'), edge('b', 'c')]);
  assert.equal(outline.items.filter((item) => item.nodeId === 'c').length, 1);
  assert.deepEqual(outline.crossReferences, [{ from: 'b', to: 'c' }]);
  assert.deepEqual(outline.roots.map((item) => item.nodeId), ['a', 'b']);
});

test('keeps undirected, bidirectional, and cyclic edges as cross-references', () => {
  const outline = projectOutline(nodes, [edge('a', 'b', 'none', 'none'), edge('b', 'c', 'arrow', 'arrow'), edge('c', 'a')]);
  assert.equal(outline.items.length, 3);
  assert.deepEqual(outline.crossReferences, [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]);
});

test('ignores group frames and emits only cards', () => {
  const withGroup = [
    { id: 'g', type: 'group', members: ['a', 'b'] },
    { id: 'a', type: 'file' },
    { id: 'b', type: 'file' },
  ];
  const outline = projectOutline(withGroup, []);
  assert.deepEqual(outline.items.map((item) => item.nodeId), ['a', 'b']);
  assert.deepEqual(outline.roots.map((item) => item.nodeId), ['a', 'b']);
});

test('a group frame can never become an outline parent', () => {
  const withGroup = [{ id: 'g', type: 'group', members: [] }, { id: 'a', type: 'file' }, { id: 'b', type: 'file' }];
  const outline = projectOutline(withGroup, [edge('a', 'g'), edge('g', 'b')]);
  assert.deepEqual(outline.roots.map((item) => item.nodeId), ['a', 'b']);
  assert.deepEqual(outline.crossReferences, []);
});
