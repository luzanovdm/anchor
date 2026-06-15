import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnchorPaths, DraftStore, buildRendered, atomicWrite, readText } from '../dist/index.js';

async function tempRoot() {
  return fs.mkdtemp(join(tmpdir(), 'anchor-test-'));
}

test('atomicWrite then read roundtrips', async () => {
  const root = await tempRoot();
  const path = join(root, 'a', 'b', 'file.md');
  await atomicWrite(path, 'hello');
  assert.equal(await readText(path), 'hello');
  // no leftover tmp files
  const dir = await fs.readdir(join(root, 'a', 'b'));
  assert.deepEqual(dir, ['file.md']);
});

test('DraftStore create/save/load is durable and titled', async () => {
  const paths = new AnchorPaths(await tempRoot());
  const store = new DraftStore(paths);
  const draft = await store.create(1000);
  await store.save(draft.meta.id, '# My note\nbody', 2000);
  const loaded = await store.load(draft.meta.id);
  assert.equal(loaded.body, '# My note\nbody');
  assert.equal(loaded.meta.title, 'My note');
  assert.equal(loaded.meta.updatedAt, 2000);
});

test('buildRendered: no skills returns body, skills wrap with separator', () => {
  const skills = [
    { id: 'rev', label: 'Review', target: 'claude', template: '/code-review\n\n{{body}}' },
    { id: 'plain', label: 'Plain', target: 'any', template: '{{body}}' },
  ];
  assert.equal(buildRendered('hi', [], skills), 'hi');
  assert.equal(buildRendered('hi', ['rev'], skills), '/code-review\n\nhi');
  assert.equal(buildRendered('hi', ['rev', 'plain'], skills), '/code-review\n\nhi\n\n---\n\nhi');
});
