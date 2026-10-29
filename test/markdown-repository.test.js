import test from 'node:test';
import assert from 'node:assert/strict';
import { FileConflictError, MarkdownRepository } from '../src/markdown-repository.js';

function fakeVault(seed = {}) {
  const files = {};
  const folders = new Set();
  for (const [path, value] of Object.entries(seed)) files[path] = { path, stat: { mtime: value.mtime }, content: value.content };
  return {
    files,
    getAbstractFileByPath: (path) => files[path] ?? (folders.has(path) ? { path, children: [] } : null),
    createFolder: async (path) => { folders.add(path); },
    create: async (path, content) => {
      const file = { path, stat: { mtime: 1 }, content };
      files[path] = file;
      return file;
    },
    read: async (file) => file.content,
    modify: async (file, content) => { file.content = content; file.stat.mtime += 1; },
  };
}

test('creates a YAML-frontmatter note in the configured folder', async () => {
  const repo = new MarkdownRepository(fakeVault(), 'Inbox/Canvas', () => new Date('2026-10-15T00:00:00.000Z'));
  const file = await repo.createNote('复利 / 长期', '第一条想法');
  assert.equal(file.path, 'Inbox/Canvas/复利 _ 长期.md');
  assert.match(file.content, /^---\ntype: canvas-note\ncreated: 2026-10-15T00:00:00.000Z\n---/);
});

test('chooses a new filename instead of replacing an existing note', async () => {
  const vault = fakeVault({ 'Inbox/Canvas/想法.md': { content: 'old', mtime: 1 } });
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  const file = await repo.createNote('想法', 'new');
  assert.equal(file.path, 'Inbox/Canvas/想法 - 2.md');
  assert.equal(vault.files['Inbox/Canvas/想法.md'].content, 'old');
});

test('preserves editor text by rejecting an external modification', async () => {
  const vault = fakeVault({ 'Inbox/A.md': { content: 'external', mtime: 20 } });
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  await assert.rejects(repo.save('Inbox/A.md', 10, 'mine'), FileConflictError);
  assert.equal(vault.files['Inbox/A.md'].content, 'external');
});

test('reads and saves through the vault adapter', async () => {
  const vault = fakeVault({ 'Inbox/A.md': { content: 'before', mtime: 10 } });
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  assert.deepEqual(await repo.read('Inbox/A.md'), { content: 'before', mtime: 10, file: vault.files['Inbox/A.md'] });
  assert.deepEqual(await repo.save('Inbox/A.md', 10, 'after'), { mtime: 11 });
  assert.equal(vault.files['Inbox/A.md'].content, 'after');
});

test('reports a missing Markdown file without creating it', async () => {
  const repo = new MarkdownRepository(fakeVault(), 'Inbox/Canvas');
  await assert.rejects(repo.read('Missing.md'), /not found/i);
});

test('switches the target folder for later notes without touching existing ones', async () => {
  const vault = fakeVault({ 'Inbox/Canvas/旧.md': { content: 'old', mtime: 1 } });
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  assert.equal(repo.setNoteFolder('  Notes\\Ideas//  '), 'Notes/Ideas');
  const file = await repo.createNote('新想法', '');
  assert.equal(file.path, 'Notes/Ideas/新想法.md');
  assert.equal(vault.files['Inbox/Canvas/旧.md'].content, 'old');
});

test('a per-call folder overrides the plugin folder without changing it', async () => {
  const vault = fakeVault();
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  const local = await repo.createNote('想法', '正文', { folder: 'Inbox/Canvas/读书' });
  assert.equal(local.path, 'Inbox/Canvas/读书/想法.md');
  // The shared repository state is untouched, so the next note still goes to the global folder.
  assert.equal(repo.noteFolder, 'Inbox/Canvas');
  const global = await repo.createNote('想法', '正文');
  assert.equal(global.path, 'Inbox/Canvas/想法.md');
});

test('two boards with different local folders never cross-contaminate', async () => {
  const vault = fakeVault();
  const repo = new MarkdownRepository(vault, 'Inbox/Canvas');
  const a = await repo.createNote('A', '', { folder: 'Inbox/Canvas/书一' });
  const b = await repo.createNote('B', '', { folder: 'Inbox/Canvas/书二' });
  assert.equal(a.path, 'Inbox/Canvas/书一/A.md');
  assert.equal(b.path, 'Inbox/Canvas/书二/B.md');
});
