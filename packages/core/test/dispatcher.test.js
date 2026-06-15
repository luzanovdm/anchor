import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnchorPaths, QueueStore, Dispatcher } from '../dist/index.js';

async function harness(state) {
  const paths = new AnchorPaths(await fs.mkdtemp(join(tmpdir(), 'anchor-disp-')));
  const queue = new QueueStore(paths);
  const injected = [];
  const dispatcher = new Dispatcher({
    queue,
    turnStateOf: () => state.turn,
    gateOf: () => state.gate,
    inject: async (key, message) => {
      injected.push(message.body);
      return { ok: true, strategy: 'tty' };
    },
    now: () => state.now++,
  });
  return { dispatcher, queue, injected };
}

const KEY = 'claude:/repo:abc';
const msg = (body) => ({ draftId: 'd1', body, attachments: [] });

test('idle + empty queue + auto gate injects immediately', async () => {
  const state = { turn: 'idle', gate: 'auto', now: 1 };
  const { dispatcher, injected, queue } = await harness(state);
  await dispatcher.send(KEY, msg('first'));
  assert.deepEqual(injected, ['first']);
  assert.equal((await queue.pending(KEY)).length, 0);
});

test('working session enqueues; turn-finalized sends exactly one', async () => {
  const state = { turn: 'working', gate: 'auto', now: 1 };
  const { dispatcher, injected, queue } = await harness(state);
  await dispatcher.send(KEY, msg('a'));
  await dispatcher.send(KEY, msg('b'));
  assert.deepEqual(injected, []);
  assert.equal((await queue.pending(KEY)).length, 2);

  await dispatcher.onTurnFinalized(KEY);
  assert.deepEqual(injected, ['a']); // exactly one per event
  assert.equal((await queue.pending(KEY)).length, 1);

  await dispatcher.onTurnFinalized(KEY);
  assert.deepEqual(injected, ['a', 'b']);
});

test('manual gate ignores turn-finalized but sendNext works', async () => {
  const state = { turn: 'idle', gate: 'manual', now: 1 };
  const { dispatcher, injected } = await harness(state);
  await dispatcher.send(KEY, msg('x')); // manual: not sent immediately
  assert.deepEqual(injected, []);
  await dispatcher.onTurnFinalized(KEY); // manual: ignored
  assert.deepEqual(injected, []);
  await dispatcher.sendNext(KEY); // explicit
  assert.deepEqual(injected, ['x']);
});
