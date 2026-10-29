import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeByKey } from '../src/serial-queue.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('work queued for the same key runs one task at a time, in order', async () => {
  const queues = new Map();
  const events = [];
  const first = serializeByKey(queues, 'board', async () => {
    events.push('a:start');
    await delay(10);
    events.push('a:end');
  });
  const second = serializeByKey(queues, 'board', async () => {
    events.push('b:start');
    await delay(1);
    events.push('b:end');
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queues.size, 0, 'an idle queue must not leak entries');
});

test('different keys are independent', async () => {
  const queues = new Map();
  const events = [];
  const first = serializeByKey(queues, 'a', async () => {
    events.push('a:start');
    await delay(10);
    events.push('a:end');
  });
  const second = serializeByKey(queues, 'b', async () => {
    events.push('b:start');
    await delay(1);
    events.push('b:end');
  });

  await Promise.all([first, second]);
  assert.deepEqual(events, ['a:start', 'b:start', 'b:end', 'a:end']);
});

test('a failing task is reported to its caller but never blocks the queue', async () => {
  const queues = new Map();
  const failed = serializeByKey(queues, 'board', async () => {
    throw new Error('create failed');
  });
  const next = serializeByKey(queues, 'board', async () => 'ok');

  await assert.rejects(failed, /create failed/);
  assert.equal(await next, 'ok');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queues.size, 0);
});
