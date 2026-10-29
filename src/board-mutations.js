/**
 * Serialises board mutations and makes "latest state wins" structural.
 *
 * Every write is: wait for any gesture to end → clone the *current* board → mutate the
 * clone → save → install. Because the clone is taken inside the queue, a mutation can
 * never be computed from a board snapshot that predates another queued write.
 *
 * The queue also exposes `idle()`, so switching boards, closing a surface or handing the
 * single-writer token to another view can wait for work that has been queued but has not
 * reached `BoardStore.save()` yet — that work is invisible to `BoardStore.flush()`.
 */

/** Rejection code for a write refused because a lifecycle change paused the queue. */
export const BOARD_WRITES_PAUSED = 'board-writes-paused';

export function createMutationQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  // Pauses are reference-counted by token, not a boolean: two overlapping lifecycle
  // operations (a reload and an openFullView, say) each hold their own token, and writes
  // stay refused until the *last* one finishes. A boolean would let the first finisher
  // resume writes while the second is still loading or handing off.
  const pauses = new Set();
  let pauseSeq = 0;
  const enqueue = (task) => {
    if (pauses.size) {
      const error = new Error('Board writes are paused for a lifecycle change');
      error.code = BOARD_WRITES_PAUSED;
      return Promise.reject(error);
    }
    pending += 1;
    const run = tail.catch(() => {}).then(task);
    // The barrier never rejects; it settles only after the task and the counter update.
    tail = run.then(
      () => { pending -= 1; },
      () => { pending -= 1; },
    );
    return run;
  };
  /** Resolves once everything queued before this call has finished (success or failure). */
  enqueue.idle = () => tail;
  enqueue.pending = () => pending > 0;
  /**
   * Refuses further writes until the matching `resume(token)`. Returns the token; only the
   * holder may release it, and the queue re-opens only when every token is gone.
   */
  enqueue.pause = () => {
    const token = Object.freeze({ id: ++pauseSeq });
    pauses.add(token);
    return token;
  };
  enqueue.resume = (token) => {
    if (token === undefined) pauses.clear();
    else pauses.delete(token);
  };
  enqueue.isPaused = () => pauses.size > 0;
  enqueue.pauseCount = () => pauses.size;
  return enqueue;
}

/**
 * One mutating write.
 *
 * @param queue    `createMutationQueue()` result.
 * @param read     Returns the live board.
 * @param commit   Saves the clone and installs it; returns true/false.
 * @param before   Optional gate (for example "wait for the drag to end").
 * @param mutator  Receives a fresh clone; return `false` to abort without writing.
 */
export async function runBoardMutation(queue, { read, commit, before = null }, mutator) {
  return queue(async () => {
    if (before) await before();
    const next = JSON.parse(JSON.stringify(read()));
    const outcome = await mutator(next);
    if (outcome === false) return false;
    return commit(next);
  });
}
