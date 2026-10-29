import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, normalizeNoteFolder, normalizeReadFlowBindings, normalizeSettings, noteFolderPreview } from '../src/settings.js';
import { DEFAULT_BOARD_PATH } from '../src/board-catalog.js';

test('falls back to the default folder and board when no settings were saved yet', () => {
  assert.deepEqual(normalizeSettings(null), { noteFolder: 'Inbox/Canvas', lastBoardPath: DEFAULT_BOARD_PATH, readFlowIntegrationEnabled: true, readFlowBindings: {} });
  assert.deepEqual(normalizeSettings({}), { noteFolder: 'Inbox/Canvas', lastBoardPath: DEFAULT_BOARD_PATH, readFlowIntegrationEnabled: true, readFlowBindings: {} });
  assert.deepEqual(normalizeSettings({ noteFolder: '' }), { noteFolder: 'Inbox/Canvas', lastBoardPath: DEFAULT_BOARD_PATH, readFlowIntegrationEnabled: true, readFlowBindings: {} });
});

test('keeps a remembered board and falls back when it is unusable', () => {
  const managed = 'Canvas/Knowledge Canvas/读书.canvas';
  assert.equal(normalizeSettings({ lastBoardPath: managed }).lastBoardPath, managed);
  assert.equal(normalizeSettings({ lastBoardPath: '   ' }).lastBoardPath, DEFAULT_BOARD_PATH);
  assert.equal(normalizeSettings({ lastBoardPath: 42 }).lastBoardPath, DEFAULT_BOARD_PATH);
});

test('keeps a saved folder path as-is', () => {
  assert.equal(normalizeSettings({ noteFolder: 'Notes/Ideas' }).noteFolder, 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('  想法/复利  '), '想法/复利');
});

test('strips surrounding and repeated slashes', () => {
  assert.equal(normalizeNoteFolder('/Notes/Ideas/'), 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('//Notes//Ideas//'), 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('Notes/ /Ideas'), 'Notes/Ideas');
});

test('accepts Windows-style separators', () => {
  assert.equal(normalizeNoteFolder('Notes\\Ideas'), 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('\\Notes\\Ideas\\'), 'Notes/Ideas');
});

test('replaces characters that are illegal in vault paths', () => {
  assert.equal(normalizeNoteFolder('Notes:Ideas'), 'Notes_Ideas');
  assert.equal(normalizeNoteFolder('a<b>c?d"e|f*g'), 'a_b_c_d_e_f_g');
});

test('drops relative-path segments', () => {
  assert.equal(normalizeNoteFolder('Notes/./Ideas'), 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('Notes/../Ideas'), 'Notes/Ideas');
  assert.equal(normalizeNoteFolder('..'), 'Inbox/Canvas');
});

test('only writes a usable folder path', () => {
  assert.equal(normalizeNoteFolder('   '), DEFAULT_SETTINGS.noteFolder);
  assert.equal(normalizeNoteFolder('/'), DEFAULT_SETTINGS.noteFolder);
  assert.equal(normalizeNoteFolder(null), DEFAULT_SETTINGS.noteFolder);
});

test('reports a blank input as using the default', () => {
  const preview = noteFolderPreview('  ', { exists: true });
  assert.equal(preview.folder, 'Inbox/Canvas');
  assert.equal(preview.status, 'default');
  assert.equal(preview.fellBackToDefault, true);
});

test('reports whether the folder already exists', () => {
  assert.equal(noteFolderPreview('Notes/Ideas', { exists: true }).status, 'exists');
  assert.equal(noteFolderPreview('Notes/Ideas', { exists: false }).status, 'create');
});

test('flags inputs that had to be rewritten', () => {
  const rewritten = noteFolderPreview('  Notes//Ideas:/  ', { exists: false });
  assert.equal(rewritten.folder, 'Notes/Ideas_');
  assert.equal(rewritten.rewritten, true);
  assert.equal(noteFolderPreview('Notes/Ideas', { exists: false }).rewritten, false);
  assert.equal(noteFolderPreview('  Notes/Ideas  ', { exists: false }).rewritten, false);
});

test('ReadFlow integration defaults to enabled and remembers an explicit opt-out', () => {
  assert.equal(DEFAULT_SETTINGS.readFlowIntegrationEnabled, true);
  assert.equal(normalizeSettings(null).readFlowIntegrationEnabled, true);
  assert.equal(normalizeSettings({}).readFlowIntegrationEnabled, true);
  assert.equal(normalizeSettings({ readFlowIntegrationEnabled: false }).readFlowIntegrationEnabled, false);
  assert.equal(normalizeSettings({ readFlowIntegrationEnabled: true }).readFlowIntegrationEnabled, true);
});

test('per-book ReadFlow bindings keep only non-empty string board paths', () => {
  assert.deepEqual(normalizeReadFlowBindings(null), {});
  assert.deepEqual(normalizeReadFlowBindings([]), {});
  assert.deepEqual(normalizeReadFlowBindings({ 'rf-1': 'Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas' }), {
    'rf-1': 'Canvas/Knowledge Canvas/ReadFlow/rf-1-书.canvas',
  });
  assert.deepEqual(normalizeReadFlowBindings({ 'rf-1': '  ', 'rf-2': 42, 'rf-3': 'a.canvas' }), { 'rf-3': 'a.canvas' });
  assert.deepEqual(normalizeSettings({ readFlowBindings: { 'rf-9': 'X.canvas' } }).readFlowBindings, { 'rf-9': 'X.canvas' });
});
