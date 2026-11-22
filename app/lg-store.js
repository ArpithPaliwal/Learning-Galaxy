/* Learning Galaxy — on-device document store.
 * Same shape as the claude.ai artifact database the app was written for:
 *   db.collection('topics').orderBy('date','desc').limit(80).onSnapshot(cb)
 *   db.doc('topics/abc').set(obj) / .update(obj) / .delete()
 * Records live in memory, persist to IndexedDB, and carry `updated` (ms) + `dirty`
 * so the sync layer can push local changes and merge remote ones (last writer wins).
 * Works without IndexedDB (memory only), which is what the tests use. */
(function (root) {
  'use strict';

  const clone = (v) => (v == null ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

  function openIdb(name) {
    return new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(name, 1);
        req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'path' }); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  const idbAll = (db) => new Promise((resolve) => { try { const r = db.transaction('docs').objectStore('docs').getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); } catch (e) { resolve([]); } });

  function cmp(a, b) {
    if (a === b) return 0; if (a == null) return -1; if (b == null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  }

  function createStore(opts = {}) {
    const docs = new Map(); // path -> {path, col, id, data, updated, deleted, dirty}
    const listeners = new Set();
    const changeHooks = new Set();
    let idb = null; let pendingWrites = new Map(); let flushT = null;
    const now = opts.now || (() => Date.now());

    const ready = (async () => {
      if (opts.idb === false) return;
      idb = await openIdb(opts.name || 'learning-galaxy');
      if (!idb) return;
      for (const r of await idbAll(idb)) docs.set(r.path, r);
    })();

    function persist(rec) {
      if (!idb) return;
      pendingWrites.set(rec.path, rec);
      clearTimeout(flushT);
      flushT = setTimeout(flush, 120);
    }
    function flush() {
      if (!idb || !pendingWrites.size) return Promise.resolve();
      const batch = [...pendingWrites.values()]; pendingWrites = new Map();
      return new Promise((resolve) => {
        try {
          const tx = idb.transaction('docs', 'readwrite'); const st = tx.objectStore('docs');
          for (const r of batch) st.put(r);
          tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); tx.onabort = () => resolve();
        } catch (e) { resolve(); }
      });
    }

    const dirtyCols = new Set(); let notifyQueued = false;
    function notify(col) {
      dirtyCols.add(col);
      if (notifyQueued) return; notifyQueued = true;
      Promise.resolve().then(() => {
        notifyQueued = false; const cols = new Set(dirtyCols); dirtyCols.clear();
        for (const l of listeners) if (cols.has(l.col)) fire(l);
        for (const h of changeHooks) { try { h(cols); } catch (e) {} }
      });
    }
    function rows(col) { const out = []; for (const r of docs.values()) if (r.col === col && !r.deleted) out.push(r); return out; }
    function fire(l) {
      let list = rows(l.col);
      if (l.order) { const { f, dir } = l.order; list.sort((a, b) => cmp(a.data && a.data[f], b.data && b.data[f]) * (dir === 'desc' ? -1 : 1)); }
      if (l.lim != null) list = list.slice(0, l.lim);
      const snap = { size: list.length, empty: !list.length, docs: list.map((r) => ({ id: r.id, exists: true, data: () => clone(r.data) })) };
      try { l.cb(snap); } catch (e) { console.error(e); }
    }

    function splitPath(path) {
      const p = String(path).split('/'); if (p.length !== 2 || !p[0] || !p[1]) throw Object.assign(new Error('Bad document path: ' + path), { code: 'invalid_path' });
      return { col: p[0], id: p[1] };
    }
    function write(path, data, deleted, meta = {}) {
      const { col, id } = splitPath(path);
      const rec = { path, col, id, data: deleted ? null : clone(data), updated: meta.updated != null ? meta.updated : now(), deleted: !!deleted, dirty: meta.dirty !== false };
      docs.set(path, rec); persist(rec); notify(col); return rec;
    }
    const stripDeletes = (o) => { const out = {}; for (const [k, v] of Object.entries(o || {})) if (!(v && typeof v === 'object' && v.__delete__ === true)) out[k] = v; return out; };

    function query(col, order, lim) {
      return {
        orderBy: (f, dir = 'asc') => query(col, { f, dir }, lim),
        limit: (n) => query(col, order, n),
        onSnapshot(cb, onErr) {
          const l = { col, order, lim, cb, onErr }; listeners.add(l);
          ready.then(() => listeners.has(l) && fire(l));
          return () => listeners.delete(l);
        },
        async get() { await ready; let out; fire({ col, order, lim, cb: (s) => { out = s; } }); return out; },
        doc: (id) => docRef(col + '/' + id),
      };
    }
    function docRef(path) {
      splitPath(path);
      return {
        id: path.split('/')[1], path,
        async get() { await ready; const r = docs.get(path); return { id: path.split('/')[1], exists: !!(r && !r.deleted), data: () => (r && !r.deleted ? clone(r.data) : undefined) }; },
        async set(d) { await ready; write(path, stripDeletes(d), false); },
        async update(d) {
          await ready; const r = docs.get(path);
          if (!r || r.deleted) throw Object.assign(new Error('Document does not exist: ' + path), { code: 'not_found' });
          const merged = Object.assign({}, r.data, d);
          for (const [k, v] of Object.entries(d || {})) if (v && typeof v === 'object' && v.__delete__ === true) delete merged[k];
          write(path, merged, false);
        },
        async delete() { await ready; if (docs.has(path)) write(path, null, true); },
      };
    }

    return {
      ready,
      db: { collection: (c) => query(c, null, null), doc: docRef },
      flush,
      onChange(fn) { changeHooks.add(fn); return () => changeHooks.delete(fn); },
      /* sync helpers */
      dirty: () => [...docs.values()].filter((r) => r.dirty),
      markClean(recs) { for (const r of recs) { const cur = docs.get(r.path); if (cur && cur.updated === r.updated && cur.dirty) { cur.dirty = false; persist(cur); } } },
      /** Apply a remote record if it is newer than ours. Returns true when applied. */
      applyRemote(r) {
        const cur = docs.get(r.path);
        if (cur && cur.updated >= r.updated) return false;
        const { col, id } = splitPath(r.path);
        const rec = { path: r.path, col, id, data: r.deleted ? null : r.data, updated: Number(r.updated) || 0, deleted: !!r.deleted, dirty: false };
        docs.set(r.path, rec); persist(rec); notify(col); return true;
      },
      /** Bulk import {collection: {id: data}}; every doc becomes dirty so it syncs up. */
      importAll(obj) {
        let n = 0;
        for (const [col, byId] of Object.entries(obj || {})) {
          if (!byId || typeof byId !== 'object' || !/^[A-Za-z0-9_\-.~:@+]+$/.test(col)) continue;
          for (const [id, data] of Object.entries(byId)) {
            if (!data || typeof data !== 'object' || !/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) continue;
            const { id: _drop, ...rest } = data; write(col + '/' + id, rest, false); n++;
          }
        }
        return n;
      },
      exportAll() {
        const out = {};
        for (const r of docs.values()) { if (r.deleted) continue; (out[r.col] = out[r.col] || {})[r.id] = clone(r.data); }
        return out;
      },
      count() { let n = 0; for (const r of docs.values()) if (!r.deleted) n++; return n; },
      get: (path) => { const r = docs.get(path); return r && !r.deleted ? clone(r.data) : undefined; },
    };
  }

  root.LGStore = { createStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = { createStore };
})(typeof window !== 'undefined' ? window : globalThis);
