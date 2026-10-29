import test from 'node:test';
import assert from 'node:assert/strict';
import {
  destroyEmbeddedControllers,
  mountEmbeddedController,
} from '../src/embedded-registry.js';

test('a controller joins the live set only after its mount resolves', async () => {
  const set = new Set();
  const order = [];
  const controller = {
    mount: async () => {
      order.push('mount');
      assert.equal(set.has(controller), false, 'must not be registered mid-mount');
    },
    destroy: async () => order.push('destroy'),
  };
  const mounted = await mountEmbeddedController(set, controller);
  assert.equal(mounted, controller);
  assert.deepEqual(order, ['mount']);
  assert.equal(set.has(controller), true);
});

test('a mount that throws is torn down instead of leaking its writer token', async () => {
  const set = new Set();
  const calls = [];
  const controller = {
    mount: async () => {
      calls.push('mount');
      throw new Error('render failed');
    },
    destroy: async () => {
      calls.push('destroy');
    },
  };
  await assert.rejects(
    mountEmbeddedController(set, controller),
    /render failed/,
  );
  assert.deepEqual(calls, ['mount', 'destroy'], 'the caller never sees the controller, so the rollback must destroy it');
  assert.equal(set.size, 0, 'a rolled-back surface must not stay registered');
});

test('a mount whose rollback also fails stays registered so a later disable can retry', async () => {
  const set = new Set();
  let destroyAttempts = 0;
  const controller = {
    mount: async () => {
      throw new Error('render failed');
    },
    destroy: async () => {
      destroyAttempts += 1;
      if (destroyAttempts === 1) throw new Error('flush failed');
      set.delete(controller);
    },
  };
  await assert.rejects(
    mountEmbeddedController(set, controller),
    /render failed/,
  );
  assert.equal(set.has(controller), true, 'a surface that could not roll back must stay retryable');
  assert.match(controller.teardownError.message, /flush failed/);

  const failures = await destroyEmbeddedControllers(set);
  assert.deepEqual(failures, []);
  assert.equal(destroyAttempts, 2);
  assert.equal(set.size, 0);
});

test('destroyEmbeddedControllers collects teardown failures without blocking the others', async () => {
  const set = new Set();
  const destroyed = [];
  const failing = {
    destroy: async () => {
      throw new Error('unsaved editor');
    },
  };
  const healthy = {
    destroy: async () => {
      destroyed.push('healthy');
      set.delete(healthy);
    },
  };
  set.add(failing);
  set.add(healthy);

  const failures = await destroyEmbeddedControllers(set);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /unsaved editor/);
  assert.deepEqual(destroyed, ['healthy']);
  assert.equal(set.has(failing), true, 'the failed surface stays registered for a retry');
  assert.equal(set.has(healthy), false);
});
