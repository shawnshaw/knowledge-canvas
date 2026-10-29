import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMPORT_CARD,
  IMPORT_GAP,
  filesUnderFolder,
  isMarkdownPath,
  layoutImportedCards,
  planImport,
} from '../src/board-import.js';

const file = (path, extension = 'md') => ({ path, extension });

test('only Markdown is importable', () => {
  assert.equal(isMarkdownPath('A.md'), true);
  assert.equal(isMarkdownPath('A.MD'), true);
  assert.equal(isMarkdownPath('A.png'), false);
  assert.equal(isMarkdownPath(''), false);
});

test('a folder import is recursive and ignores non-Markdown files', () => {
  const files = [
    file('Books/A.md'),
    file('Books/Sub/B.md'),
    file('Books/Sub/image.png', 'png'),
    file('Books/Other/C.canvas', 'canvas'),
    file('Booksletter/D.md'),
  ];
  assert.deepEqual(filesUnderFolder(files, 'Books').map((entry) => entry.path), ['Books/A.md', 'Books/Sub/B.md']);
  assert.deepEqual(filesUnderFolder(files, 'Books/Sub').map((entry) => entry.path), ['Books/Sub/B.md']);
  assert.deepEqual(filesUnderFolder(files, '').map((entry) => entry.path), ['Books/A.md', 'Books/Sub/B.md', 'Booksletter/D.md']);
});

test('already-present paths, repeats and non-Markdown are skipped', () => {
  const plan = planImport(
    ['Books/A.md', 'Books/A.md', 'Books/B.md', 'Books/C.png', 'Books/B.md'],
    ['Books/B.md'],
  );
  assert.deepEqual(plan.added, ['Books/A.md']);
  assert.deepEqual(plan.duplicates, ['Books/A.md', 'Books/B.md']);
  assert.deepEqual(plan.skippedExisting, ['Books/B.md']);
  assert.deepEqual(plan.skippedInvalid, ['Books/C.png']);
});

test('an empty batch plans nothing', () => {
  assert.deepEqual(planImport([], ['Books/A.md']), {
    added: [],
    skippedExisting: [],
    skippedInvalid: [],
    duplicates: [],
  });
});

test('imported cards are laid out deterministically to the right of existing content', () => {
  const existing = [{ id: 'a', type: 'file', file: 'A.md', x: 0, y: 100, width: 320, height: 220 }];
  const first = layoutImportedCards(['B.md', 'C.md', 'D.md', 'E.md'], existing);
  const second = layoutImportedCards(['E.md', 'C.md', 'B.md', 'D.md'], existing);
  assert.deepEqual(first, second, 'input order must not change the layout');
  assert.deepEqual(first.map((entry) => entry.path), ['B.md', 'C.md', 'D.md', 'E.md']);

  // 2x2 grid starting one gap to the right of the existing card, aligned to its top.
  assert.deepEqual(first[0].point, { x: 320 + IMPORT_GAP, y: 100 });
  assert.deepEqual(first[1].point, { x: 320 + IMPORT_GAP + IMPORT_CARD.width + IMPORT_GAP, y: 100 });
  assert.deepEqual(first[2].point, { x: 320 + IMPORT_GAP, y: 100 + IMPORT_CARD.height + IMPORT_GAP });
});

test('an empty board imports from the origin', () => {
  assert.deepEqual(layoutImportedCards(['A.md'], []), [{ path: 'A.md', point: { x: 0, y: 0 } }]);
});

test('no paths means no placements', () => {
  assert.deepEqual(layoutImportedCards([], [{ id: 'a', type: 'file', file: 'A.md', x: 0, y: 0, width: 10, height: 10 }]), []);
});
