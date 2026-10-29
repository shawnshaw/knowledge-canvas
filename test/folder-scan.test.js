import test from 'node:test';
import assert from 'node:assert/strict';
import { scanFolderFiles } from '../src/folder-scan.js';

const file = (path, extension = 'md') => ({ path, extension });
const many = (count, prefix = 'Books') => Array.from({ length: count }, (_, index) => file(`${prefix}/${index}.md`));

test('a scan yields between batches so the UI can paint progress', async () => {
  const events = [];
  const files = many(5);
  const result = await scanFolderFiles(files, 'Books', {
    chunkSize: 2,
    yieldTo: async () => { events.push('yield'); },
    onChunk: (scanned) => events.push(`chunk:${scanned}`),
  });
  assert.equal(result.length, 5);
  assert.deepEqual(events, ['chunk:2', 'yield', 'chunk:4', 'yield']);
});

test('a scan below one chunk never yields, so no progress notice is shown', async () => {
  let yields = 0;
  const result = await scanFolderFiles(many(3), 'Books', {
    chunkSize: 200,
    yieldTo: async () => { yields += 1; },
    onChunk: () => { throw new Error('must not report progress for a short scan'); },
  });
  assert.equal(result.length, 3);
  assert.equal(yields, 0);
});

test('the scan is recursive and ignores non-Markdown and sibling folders', async () => {
  const files = [
    file('Books/A.md'),
    file('Books/Sub/B.md'),
    file('Books/Sub/pic.png', 'png'),
    file('Booksletter/C.md'),
    file('Other/D.md'),
  ];
  const result = await scanFolderFiles(files, 'Books', { chunkSize: 1000 });
  assert.deepEqual(result.map((entry) => entry.path), ['Books/A.md', 'Books/Sub/B.md']);
});

test('a blank folder scans the whole vault', async () => {
  const result = await scanFolderFiles([file('A.md'), file('B/C.md'), file('B/x.png', 'png')], '', { chunkSize: 1000 });
  assert.deepEqual(result.map((entry) => entry.path), ['A.md', 'B/C.md']);
});

test('an empty scan resolves immediately', async () => {
  assert.deepEqual(await scanFolderFiles([], 'Books'), []);
});
