import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createStore } = createRequire(import.meta.url)('../app/lg-store.js');

const tick = () => new Promise((r) => setTimeout(r, 0));

test('set / update / delete and snapshots', async () => {
  const s = createStore({ idb: false });
  const seen = [];
  s.db.collection('topics').onSnapshot((snap) => seen.push(snap.docs.map((d) => [d.id, d.data().title])));
  await s.db.doc('topics/a').set({ title: 'A', n: 1 });
  await s.db.doc('topics/b').set({ title: 'B' });
  await tick();
  assert.deepEqual(seen.at(-1).sort(), [['a', 'A'], ['b', 'B']]);
  await s.db.doc('topics/a').update({ n: 2, gone: { __delete__: true } });
  assert.deepEqual(s.get('topics/a'), { title: 'A', n: 2 });
  await s.db.doc('topics/a').delete();
  await tick();
  assert.deepEqual(seen.at(-1), [['b', 'B']]);
  await assert.rejects(s.db.doc('topics/zzz').update({ x: 1 }), { code: 'not_found' });
});

test('orderBy + limit', async () => {
  const s = createStore({ idb: false });
  for (const d of ['2026-01-03', '2026-01-01', '2026-01-02']) await s.db.doc('news/' + d).set({ date: d });
  let ids;
  s.db.collection('news').orderBy('date', 'desc').limit(2).onSnapshot((snap) => (ids = snap.docs.map((d) => d.id)));
  await tick();
  assert.deepEqual(ids, ['2026-01-03', '2026-01-02']);
});

test('snapshot data is a copy', async () => {
  const s = createStore({ idb: false });
  await s.db.doc('meta/p').set({ list: [1] });
  const snap = await s.db.collection('meta').get();
  snap.docs[0].data().list.push(2);
  assert.deepEqual(s.get('meta/p'), { list: [1] });
});

test('sync helpers: dirty, markClean, applyRemote (last writer wins)', async () => {
  let t = 1000; const s = createStore({ idb: false, now: () => t });
  await s.db.doc('tasks/x').set({ title: 'local' });
  assert.equal(s.dirty().length, 1);
  s.markClean(s.dirty());
  assert.equal(s.dirty().length, 0);
  assert.equal(s.applyRemote({ path: 'tasks/x', data: { title: 'older' }, updated: 999, deleted: false }), false);
  assert.equal(s.get('tasks/x').title, 'local');
  assert.equal(s.applyRemote({ path: 'tasks/x', data: { title: 'newer' }, updated: 2000, deleted: false }), true);
  assert.equal(s.get('tasks/x').title, 'newer');
  assert.equal(s.dirty().length, 0, 'remote records are not dirty');
  assert.equal(s.applyRemote({ path: 'tasks/x', data: null, updated: 3000, deleted: true }), true);
  assert.equal(s.get('tasks/x'), undefined);
  // a local edit after markClean must stay dirty
  t = 5000; await s.db.doc('tasks/y').set({ a: 1 }); const snap = s.dirty(); t = 6000; await s.db.doc('tasks/y').set({ a: 2 });
  s.markClean(snap); assert.equal(s.dirty().length, 1);
});

test('importAll / exportAll round trip and rejects bad ids', () => {
  const s = createStore({ idb: false });
  const n = s.importAll({ topics: { a: { title: 'A', id: 'a' }, 'bad/id': { title: 'x' } }, 'bad col': { z: {} }, meta: { profile: { name: 'me' } } });
  assert.equal(n, 2);
  assert.deepEqual(s.exportAll(), { topics: { a: { title: 'A' } }, meta: { profile: { name: 'me' } } });
  assert.equal(s.count(), 2);
});
