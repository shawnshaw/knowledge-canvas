/**
 * Live-set bookkeeping for embedded ReadFlow surfaces.
 *
 * A controller joins the plugin's live set only after its mount fully succeeds. A mount
 * that throws (a failed render, a board that cannot be read) is torn down here first, so
 * its document listeners and writer token are released even though the caller never
 * receives a controller it could destroy itself.
 */

/**
 * Mounts `controller` and registers it in `set` only once the mount has resolved.
 *
 * When the mount fails the half-built surface is destroyed immediately: that flushes the
 * board, removes its document listeners and releases the single-writer token. If the
 * rollback teardown also fails the controller stays registered so a later integration
 * disable can retry it instead of leaking the token permanently.
 */
export async function mountEmbeddedController(set, controller, mount = () => controller.mount()) {
  try {
    await mount();
  } catch (error) {
    try {
      await controller.destroy();
    } catch (teardownError) {
      set?.add?.(controller);
      controller.teardownError = teardownError;
    }
    throw error;
  }
  set?.add?.(controller);
  return controller;
}

/**
 * Destroys every live embedded surface, awaiting each teardown independently so one
 * surface that cannot shut down never blocks the others. Successful teardowns remove
 * themselves from the set; failures are collected so the caller can surface them.
 */
export async function destroyEmbeddedControllers(set) {
  const failures = [];
  for (const controller of [...(set ?? [])]) {
    try {
      await controller.destroy();
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}
