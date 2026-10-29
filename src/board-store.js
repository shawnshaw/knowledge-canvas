import { parseBoard } from './board-model.js';

export class BoardStore {
  constructor(adapter) {
    this.adapter = adapter;
    this.queues = new Map();
    this.loadStates = new Map();
    // Single-writer ownership per file: a mounted surface acquires its board so a second
    // surface editing the same `.canvas` cannot silently overwrite it with a stale snapshot.
    this.writers = new Map();
  }

  async load(file) {
    try {
      const board = parseBoard(await this.adapter.read(file));
      this.loadStates.set(file, 'ready');
      return board;
    } catch (error) {
      this.loadStates.set(file, 'blocked');
      throw error;
    }
  }

  /** Claims the write token for a file. Idempotent for the same token; refused if taken. */
  acquireWriter(file, token) {
    if (!token) return false;
    const owner = this.writers.get(file);
    if (owner && owner !== token) return false;
    this.writers.set(file, token);
    return true;
  }

  /** Releases the write token when the surface shuts down or switches away. */
  releaseWriter(file, token) {
    if (this.writers.get(file) === token) this.writers.delete(file);
  }

  /** Moves ownership to a new token, which is how `openFullView` hands off to the full view. */
  transferWriter(file, from, to) {
    if (!to || this.writers.get(file) !== from) return false;
    this.writers.set(file, to);
    return true;
  }

  isWriter(file, token) {
    return Boolean(token) && this.writers.get(file) === token;
  }

  async save(file, board, options = {}) {
    if (this.loadStates.get(file) === 'blocked') throw new Error('Board is read-only until a successful reload');
    const owner = this.writers.get(file);
    if (owner && owner !== options.token) {
      throw new Error('Board is read-only: another surface owns this board');
    }
    const valid = parseBoard(JSON.stringify(board));
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.adapter.process(file, () => JSON.stringify(valid, null, 2)));
    this.queues.set(file, next);
    next.finally(() => {
      if (this.queues.get(file) === next) this.queues.delete(file);
    }).catch(() => {});
    return next;
  }

  async flush() {
    await Promise.all([...this.queues.values()]);
  }
}
