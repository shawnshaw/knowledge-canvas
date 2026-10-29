/**
 * Serialises lifecycle operations for one view, and closes the door for good once shutdown
 * begins.
 *
 * A board switch, reload, re-target or hand-off is a sequence of steps — close the editor,
 * drain writes, load, swap the writer token and path, restore the UI. Running two of them
 * at once lets a later, failed operation restore an earlier path while keeping the newer
 * board and writer, so the next save can land in the wrong `.canvas`.
 *
 * Shutdown is special: `disablePlugin()` waits for it, but the old view object is still
 * reachable while the new plugin instance starts. A switch submitted after shutdown began
 * must not run at all — it would reload a canvas, write settings and re-acquire a writer
 * against a disposed view. `shutdown()` is idempotent and rejects all later lifecycles; a
 * failed shutdown reopens the queue because the view is still alive.
 */

export function createLifecycleQueue() {
  let tail = Promise.resolve();
  let closing = false;
  let shutdown = null;

  const enqueue = (task) => {
    const current = tail.catch(() => {}).then(task);
    tail = current.then(
      () => {},
      () => {},
    );
    return current;
  };

  /** Runs a lifecycle task, unless shutdown already started. */
  const run = (task) => {
    if (closing) return Promise.resolve(false);
    // Accepted before shutdown: FIFO guarantees it runs before the shutdown task, so a
    // switch that was already submitted is never silently abandoned mid-way.
    return enqueue(task);
  };

  /** Starts (or joins) the shutdown. Later lifecycle requests are refused. */
  run.shutdown = (task) => {
    if (shutdown) return shutdown;
    closing = true;
    shutdown = enqueue(() => task()).catch((error) => {
      // Shutdown failed, so the view is still alive and may accept lifecycle work again.
      closing = false;
      shutdown = null;
      throw error;
    });
    return shutdown;
  };

  run.isClosing = () => closing;
  return run;
}
