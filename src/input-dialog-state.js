import { normalizeBoardName } from './board-catalog.js';

export function createInputResult(resolve) {
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  return {
    submit: (value) => finish(value),
    cancel: () => finish(null),
  };
}

// Normalizes a sticky-note dialog result. Returns null when the title is
// blank after trimming, which the caller treats as "do not submit".
export function normalizeStickyNote(values) {
  const title = String(values?.title ?? '').trim();
  if (!title) return null;
  return { title, body: String(values?.body ?? '') };
}

// A relation label is free text. Empty/whitespace resolves to null, which the
// caller treats as "delete the label".
export function normalizeEdgeLabel(values) {
  const label = String(values?.label ?? '').trim();
  return label || null;
}

// A file path resolves to its trimmed value, or null when blank.
export function normalizeFilePath(values) {
  const path = String(values?.path ?? '').trim();
  return path || null;
}

// A canvas name resolves to its vault-safe value, or null when blank. Names that
// would escape the managed folder throw, which the caller turns into a Notice.
export function normalizeBoardNameInput(values) {
  const raw = String(values?.name ?? '').trim();
  if (!raw) return null;
  return { name: normalizeBoardName(raw) };
}

// New-board dialog: the name plus whether this board gets a canvas-local note folder.
// The checkbox is off unless it was explicitly ticked, which keeps the old behaviour.
export function normalizeBoardCreateInput(values) {
  const name = normalizeBoardNameInput(values);
  if (!name) return null;
  return { name: name.name, createNoteFolder: values?.createNoteFolder === true };
}
