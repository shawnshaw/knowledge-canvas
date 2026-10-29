/**
 * Bridge between the floating editor's post-save hook and the view's board work.
 *
 * `EditorSession` awaits whatever `onSaved` returns, so this handler must return the
 * promise it receives — returning `undefined` (the old `void sync(...)` bridge) would let
 * the editor report "saved" before the excerpt `updatedAt` reached the canvas.
 */

export function createSourceSavedHandler(sync) {
  if (typeof sync !== 'function') return null;
  return (info) => sync(info);
}
