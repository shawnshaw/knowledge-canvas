import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceSavedHandler } from '../src/editor-bridge.js';
import { EditorSession } from '../src/floating-editor.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the bridge returns the sync promise instead of discarding it', () => {
  const sync = async () => 'board-written';
  const handler = createSourceSavedHandler(sync);
  const result = handler({ filePath: 'A.md', content: 'x', savedAt: 'T' });
  assert.equal(typeof result?.then, 'function');
});

test('a missing sync function produces no handler', () => {
  assert.equal(createSourceSavedHandler(null), null);
  assert.equal(createSourceSavedHandler(undefined), null);
});

test('EditorSession.save waits for the bridged timestamp write before resolving', async () => {
  let finished = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async () => ({ mtime: 2 }),
  };
  const session = new EditorSession('A.md', repository, {
    // Exactly the handler shape the view passes to FloatingEditor: the promise must survive.
    onSaved: createSourceSavedHandler(async () => {
      await gate;
      finished = true;
    }),
  });
  await session.load();
  session.setText('甲改。');

  let returned = false;
  const saving = session.save().then(() => { returned = true; });
  await tick();
  assert.equal(returned, false, 'save must not resolve before the bridged write');
  assert.equal(finished, false);

  release();
  await saving;
  assert.equal(finished, true);
  assert.equal(session.status, 'saved');
});
