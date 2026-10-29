import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveReadFlowPreview, dragController, clampEditorPosition, FLOATING_EDITOR_KEEP_VISIBLE, EditorSession, renderWorkspacePreservingEditor } from '../src/floating-editor.js';
import { FileConflictError } from '../src/markdown-repository.js';

test('keeps dirty text after save failure', async () => {
  const session = new EditorSession('A.md', {
    read: async () => ({ content: 'before', mtime: 1 }),
    save: async () => { throw new Error('disk full'); },
  });
  await session.load();
  session.setText('mine');
  await assert.rejects(session.save(), /disk full/);
  assert.equal(session.text, 'mine');
  assert.equal(session.dirty, true);
  assert.equal(session.status, 'error');
});

test('reports conflict without replacing local text and can explicitly keep it', async () => {
  let remote = { content: 'before', mtime: 1 };
  const repository = {
    read: async () => ({ ...remote }),
    save: async (_path, expected, content) => {
      if (expected !== remote.mtime) throw new FileConflictError('A.md', expected, remote.mtime);
      remote = { content, mtime: remote.mtime + 1 };
      return { mtime: remote.mtime };
    },
  };
  const session = new EditorSession('A.md', repository);
  await session.load();
  session.setText('mine');
  remote = { content: 'external', mtime: 2 };
  await assert.rejects(session.save(), FileConflictError);
  assert.equal(session.text, 'mine');
  assert.equal(session.status, 'conflict');
  await session.keepLocal();
  assert.deepEqual(remote, { content: 'mine', mtime: 3 });
  assert.equal(session.dirty, false);
});

test('reload replaces local text only after an explicit conflict choice', async () => {
  const session = new EditorSession('A.md', { read: async () => ({ content: 'external', mtime: 2 }), save: async () => ({ mtime: 3 }) });
  session.text = 'mine';
  session.dirty = true;
  await session.reload();
  assert.equal(session.text, 'external');
  assert.equal(session.dirty, false);
});

test('workspace rerender keeps a dirty editor root and recovery state reachable', () => {
  const host = {
    children: [],
    replaceChildren() { for (const child of this.children) child.parentElement = null; this.children = []; },
    append(child) { child.parentElement = this; this.children.push(child); },
  };
  const editorRoot = {
    parentElement: host,
    text: '我的未保存内容',
    recovery: '保存失败：disk full',
    remove() { this.parentElement.children = this.parentElement.children.filter((child) => child !== this); this.parentElement = null; },
  };
  host.children.push(editorRoot);
  renderWorkspacePreservingEditor(host, editorRoot, () => host.append({ kind: 'workspace', parentElement: null }));
  assert.equal(editorRoot.parentElement, host);
  assert.equal(host.children.at(-1), editorRoot);
  assert.equal(editorRoot.text, '我的未保存内容');
  assert.equal(editorRoot.recovery, '保存失败：disk full');
});

test('ReadFlow preview is derived from the current edited Markdown', () => {
  const edited = '---\ntype: highlight\nbook: "[[Books/A]]"\n---\n\n> 新摘录\n\n## 我的想法\n\n新想法\n';
  const preview = deriveReadFlowPreview('ReadFlow/highlight.md', edited, { type: 'highlight', book: '[[Books/A]]' });
  assert.equal(preview.excerpt, '新摘录');
  assert.equal(preview.comment, '新想法');
  assert.equal(preview.book, 'A');
});

test('flushing pending edits reports a failed save instead of pretending it succeeded', async () => {
  let writes = 0;
  const session = new EditorSession('A.md', {
    read: async () => ({ content: 'before', mtime: 1 }),
    save: async () => { writes += 1; throw new Error('disk full'); },
  });
  await session.load();
  session.setText('mine');
  assert.equal(await session.flushPending(), false);
  assert.equal(writes, 1);
  assert.equal(session.text, 'mine');
  assert.equal(session.dirty, true);
  assert.equal(session.status, 'error');
});

test('flushing pending edits saves once and clears dirty', async () => {
  let writes = 0;
  let remote = { content: 'before', mtime: 1 };
  const session = new EditorSession('A.md', {
    read: async () => ({ ...remote }),
    save: async (_path, _mtime, content) => { writes += 1; remote = { content, mtime: 2 }; return { mtime: 2 }; },
  });
  await session.load();
  session.setText('mine');
  assert.equal(await session.flushPending(), true);
  assert.equal(writes, 1);
  assert.equal(session.dirty, false);
  assert.equal(remote.content, 'mine');
});

test('flushing writes nothing when there is nothing pending', async () => {
  let writes = 0;
  const session = new EditorSession('A.md', {
    read: async () => ({ content: 'before', mtime: 1 }),
    save: async () => { writes += 1; return { mtime: 2 }; },
  });
  await session.load();
  assert.equal(await session.flushPending(), true);
  assert.equal(writes, 0);
  assert.equal(session.dirty, false);
});

test('flushing reports a conflict without dropping local text', async () => {
  const session = new EditorSession('A.md', {
    read: async () => ({ content: 'before', mtime: 1 }),
    save: async () => { throw new FileConflictError('A.md', 1, 2); },
  });
  await session.load();
  session.setText('mine');
  assert.equal(await session.flushPending(), false);
  assert.equal(session.text, 'mine');
  assert.equal(session.status, 'conflict');
  assert.equal(session.dirty, true);
});

// A tiny fake of the DOM surface the drag controller needs, so the re-render bug is
// testable without a browser. Only the methods `dragController` actually calls are real.
function fakeEl(tag = 'div', className = '') {
  const node = {
    tagName: tag.toUpperCase(),
    className,
    classList: { contains: (name) => className.split(/\s+/).filter(Boolean).includes(name) },
    style: {},
    parentElement: null,
    children: [],
    listeners: {},
    addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
    dispatch(type, event) { for (const fn of node.listeners[type] ?? []) fn(event); },
    append(child) { child.parentElement = node; node.children.push(child); },
    replaceChildren(...newChildren) { for (const child of node.children) child.parentElement = null; node.children = []; for (const child of newChildren) node.append(child); },
    contains(target) { let current = target; while (current) { if (current === node) return true; current = current.parentElement; } return false; },
    closest(selector) {
      let current = node;
      while (current) {
        if (selector === 'button' && current.tagName === 'BUTTON') return current;
        if (selector.startsWith('.') && current.classList.contains(selector.slice(1))) return current;
        current = current.parentElement;
      }
      return null;
    },
    querySelector(selector) {
      const name = selector.startsWith('.') ? selector.slice(1) : null;
      const stack = [...node.children];
      while (stack.length) {
        const current = stack.shift();
        if (name && current.classList.contains(name)) return current;
        stack.push(...current.children);
      }
      return null;
    },
    getBoundingClientRect() { return { left: 100, top: 200 }; },
    setPointerCapture() { node.captured = true; },
  };
  return node;
}

const bindDrag = (root) => {
  const controller = dragController(root);
  root.addEventListener('pointerdown', (event) => controller.onPointerDown(event));
  root.addEventListener('pointermove', (event) => controller.onPointerMove(event));
  root.addEventListener('pointerup', () => controller.onPointerUp());
  root.addEventListener('pointercancel', () => controller.onPointerCancel());
};

const buildHeader = (root) => {
  const header = fakeEl('header', 'kc-floating-header');
  const title = fakeEl('strong');
  const edit = fakeEl('button');
  header.append(title); header.append(edit);
  root.append(header);
  return { header, title, edit };
};

test('drag keeps working after a re-render replaces the header', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  bindDrag(root);

  const first = buildHeader(root);
  root.dispatch('pointerdown', { target: first.title, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: first.title, clientX: 130, clientY: 230 });
  assert.equal(root.style.left, '120px');
  assert.equal(root.style.top, '220px');
  root.dispatch('pointerup', {});

  // `render()` throws the whole header away and builds a fresh one; the drag must survive.
  root.replaceChildren();
  const second = buildHeader(root);
  root.dispatch('pointerdown', { target: second.title, clientX: 110, clientY: 210, pointerId: 2 });
  root.dispatch('pointermove', { target: second.title, clientX: 140, clientY: 240 });
  assert.equal(root.style.left, '130px');
  assert.equal(root.style.top, '230px');
});

test('a pointerdown on a header button never starts a drag', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  bindDrag(root);
  const { edit } = buildHeader(root);
  root.dispatch('pointerdown', { target: edit, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: edit, clientX: 150, clientY: 250 });
  assert.equal(root.style.left, undefined);
  assert.equal(root.style.top, undefined);
});

test('a pointerdown outside the header never starts a drag', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  bindDrag(root);
  buildHeader(root);
  const body = fakeEl('div', 'kc-editor-body');
  root.append(body);
  root.dispatch('pointerdown', { target: body, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: body, clientX: 150, clientY: 250 });
  assert.equal(root.style.left, undefined);
  assert.equal(root.style.top, undefined);
});

test('clampEditorPosition keeps a 48px grab strip on every edge of the viewport', () => {
  assert.equal(FLOATING_EDITOR_KEEP_VISIBLE, 48);
  assert.deepEqual(clampEditorPosition(-20, -30, 400, 300), { left: 0, top: 0 });
  // A 400x300 viewport: the title bar can never slide past (400-48, 300-48).
  assert.deepEqual(clampEditorPosition(1000, 900, 400, 300), { left: 352, top: 252 });
  assert.deepEqual(clampEditorPosition(120, 220, 400, 300), { left: 120, top: 220 });
});

test('drag positions are measured from the offsetParent, not the viewport', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  // The editor sits inside a positioned ancestor offset by (40, 60) from the viewport.
  root.offsetParent = { getBoundingClientRect: () => ({ left: 40, top: 60 }) };
  root.getBoundingClientRect = () => ({ left: 140, top: 260 });
  bindDrag(root);
  const { title } = buildHeader(root);
  root.dispatch('pointerdown', { target: title, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: title, clientX: 130, clientY: 230 });
  // 140 - 40 = 100 offset-relative, +20 drag = 120; 260 - 60 = 200, +20 = 220.
  assert.equal(root.style.left, '120px');
  assert.equal(root.style.top, '220px');
});

test('a drag against a real viewport is clamped so the title bar stays reachable', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  root.ownerDocument = { defaultView: { innerWidth: 400, innerHeight: 300 } };
  bindDrag(root);
  const { title } = buildHeader(root);
  root.dispatch('pointerdown', { target: title, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: title, clientX: 900, clientY: 800 });
  assert.equal(root.style.left, `${400 - FLOATING_EDITOR_KEEP_VISIBLE}px`);
  assert.equal(root.style.top, `${300 - FLOATING_EDITOR_KEEP_VISIBLE}px`);
});

test('a right-offset panel clamps to its own box, not the wider viewport', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  // The editor lives in a 200x300 panel offset from the viewport origin, but the viewport
  // itself is much wider (1000x800). The grab strip must stop at the panel's far edge.
  root.offsetParent = { getBoundingClientRect: () => ({ left: 100, top: 100, width: 200, height: 300 }) };
  root.getBoundingClientRect = () => ({ left: 120, top: 120 });
  root.ownerDocument = { defaultView: { innerWidth: 1000, innerHeight: 800 } };
  bindDrag(root);
  const { title } = buildHeader(root);
  root.dispatch('pointerdown', { target: title, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: title, clientX: 900, clientY: 800 });
  assert.equal(root.style.left, `${200 - FLOATING_EDITOR_KEEP_VISIBLE}px`);
  assert.equal(root.style.top, `${300 - FLOATING_EDITOR_KEEP_VISIBLE}px`);
});

test('a pointercancel ends the drag without a further move repositioning the editor', () => {
  const root = fakeEl('section', 'kc-floating-editor');
  bindDrag(root);
  const { title } = buildHeader(root);
  root.dispatch('pointerdown', { target: title, clientX: 110, clientY: 210, pointerId: 1 });
  root.dispatch('pointermove', { target: title, clientX: 130, clientY: 230 });
  assert.equal(root.style.left, '120px');
  root.dispatch('pointercancel', {});
  root.dispatch('pointermove', { target: title, clientX: 200, clientY: 300 });
  assert.equal(root.style.left, '120px');
  assert.equal(root.style.top, '220px');
});

const MARKER = (createdAt) => `<!-- kc-time: {"createdAt":"${createdAt}"} -->`;

test('a successful save stamps updatedAt for the marked paragraph that changed', async () => {
  const created = '2026-10-17T14:30:00.000Z';
  const initial = `甲。\n\n${MARKER(created)}\n\n乙。`;
  let saved = initial;
  const repository = {
    read: async () => ({ content: initial, mtime: 1 }),
    save: async (_path, _mtime, content) => { saved = content; return { mtime: 2 }; },
  };
  const session = new EditorSession('A.md', repository, { now: () => new Date('2026-10-17T15:12:00.000Z') });
  await session.load();
  session.setText(initial.replace('甲。', '甲改。'));
  await session.save();

  assert.match(saved, /"createdAt":"2026-10-17T14:30:00.000Z","updatedAt":"2026-10-17T15:12:00.000Z"/);
  assert.equal(session.text, saved, 'the editor holds exactly what reached disk');
  assert.equal(session.status, 'saved');
});

test('a failed save never leaves an updatedAt stamp in the editor', async () => {
  const created = '2026-10-17T14:30:00.000Z';
  const initial = `甲。\n\n${MARKER(created)}`;
  const repository = {
    read: async () => ({ content: initial, mtime: 1 }),
    save: async () => { throw new Error('disk full'); },
  };
  const session = new EditorSession('A.md', repository, { now: () => new Date('2026-10-17T15:12:00.000Z') });
  await session.load();
  const edited = initial.replace('甲。', '甲改。');
  session.setText(edited);
  await assert.rejects(session.save(), /disk full/);

  assert.equal(session.text, edited);
  assert.equal(session.text.includes('updatedAt'), false);
  assert.equal(session.status, 'error');
});

test('a save with nothing to write does not call the repository', async () => {
  let calls = 0;
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async () => { calls += 1; return { mtime: 2 }; },
  };
  const session = new EditorSession('A.md', repository);
  await session.load();
  await session.save();
  assert.equal(calls, 0);
});

test('onSaved fires once with the saved text and time', async () => {
  const events = [];
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async () => ({ mtime: 2 }),
  };
  const session = new EditorSession('A.md', repository, {
    now: () => new Date('2026-10-17T15:12:00.000Z'),
    onSaved: (info) => events.push(info),
  });
  await session.load();
  session.setText('甲改。');
  await session.save();
  assert.deepEqual(events, [{ path: 'A.md', content: '甲改。', savedAt: '2026-10-17T15:12:00.000Z' }]);
});

test('save resolves only after the async post-save lifecycle finishes', async () => {
  let finish;
  const gate = new Promise((resolve) => { finish = resolve; });
  const events = [];
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async () => ({ mtime: 2 }),
  };
  const session = new EditorSession('A.md', repository, {
    onSaved: async () => {
      events.push('callback:start');
      await gate;
      events.push('callback:end');
    },
  });
  await session.load();
  session.setText('甲改。');

  let resolved = false;
  const saving = session.save().then(() => { resolved = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['callback:start']);
  assert.equal(resolved, false, 'the save promise must not resolve before the callback');

  finish();
  await saving;
  assert.deepEqual(events, ['callback:start', 'callback:end']);
  assert.equal(resolved, true);
});

test('a failing post-save callback still leaves the Markdown save successful', async () => {
  const repository = {
    read: async () => ({ content: '甲。', mtime: 1 }),
    save: async () => ({ mtime: 2 }),
  };
  const session = new EditorSession('A.md', repository, {
    onSaved: async () => { throw new Error('board write failed'); },
  });
  await session.load();
  session.setText('甲改。');
  await session.save();
  assert.equal(session.status, 'saved');
  assert.equal(session.dirty, false);
});

test('the paragraph stamp and the callback share exactly one save instant', async () => {
  const created = '2026-10-17T14:30:00.000Z';
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 9, 17, 15, 0, tick++));
  let savedContent = '';
  let savedAt = '';
  const initial = `甲。\n\n<!-- kc-time: {"createdAt":"${created}"} -->`;
  const repository = {
    read: async () => ({ content: initial, mtime: 1 }),
    save: async (_path, _mtime, content) => { savedContent = content; return { mtime: 2 }; },
  };
  const session = new EditorSession('A.md', repository, {
    now,
    onSaved: (info) => { savedAt = info.savedAt; },
  });
  await session.load();
  session.setText(initial.replace('甲。', '甲改。'));
  await session.save();

  assert.equal(savedAt, '2026-10-17T15:00:00.000Z');
  assert.match(savedContent, new RegExp(`"updatedAt":"${savedAt}"`));
  assert.equal(tick, 1, 'exactly one clock read per save');
});
