/**
 * Runs work serially per key. Two openers that reach the same board at the same time must
 * not both run the "board does not exist yet" branch, or both would call `vault.create()`
 * for the same path; queueing them makes the second one see the file the first created.
 */

/**
 * Queues `task` behind anything already running for `key`. Tasks for different keys are
 * independent. A failing task never blocks the ones queued behind it.
 */
export function serializeByKey(queues, key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  // The barrier never rejects, so one bad task cannot poison the queue for the next caller.
  const barrier = current.then(
    () => {},
    () => {},
  );
  queues.set(key, barrier);
  barrier
    .finally(() => {
      if (queues.get(key) === barrier) queues.delete(key);
    })
    .catch(() => {});
  return current;
}
