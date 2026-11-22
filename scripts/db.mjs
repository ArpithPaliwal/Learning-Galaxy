#!/usr/bin/env node
// Command-line access to the app's cloud data, for the cloud job (GitHub Actions) and for you.
// Needs env: SUPABASE_URL, SUPABASE_SERVICE_KEY (service_role key, NEVER put it in the app), LG_USER_ID.
//
//   node scripts/db.mjs cols                       list collections with counts
//   node scripts/db.mjs list <col> [limit]         print ids (+ title/date) of a collection
//   node scripts/db.mjs get <col> <id>             print one document as JSON
//   node scripts/db.mjs dump <col> [limit]         print all documents of a collection as JSON
//   node scripts/db.mjs put <col> <id> <file.json|->   replace a document (stdin with -)
//   node scripts/db.mjs patch <col> <id> <file.json|-> merge top-level fields into a document
//   node scripts/db.mjs del <col> <id>             delete a document
import { readFileSync } from 'node:fs';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, LG_USER_ID } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !LG_USER_ID) { console.error('Set SUPABASE_URL, SUPABASE_SERVICE_KEY and LG_USER_ID.'); process.exit(2); }
const base = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/lg_docs';
const H = { apikey: SUPABASE_SERVICE_KEY, authorization: 'Bearer ' + SUPABASE_SERVICE_KEY, 'content-type': 'application/json' };
const uid = 'user_id=eq.' + encodeURIComponent(LG_USER_ID);
const ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

async function req(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
  if (!res.ok) { console.error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 400)); process.exit(1); }
  return res.status === 204 || res.status === 201 ? null : res.json();
}
const readJson = (f) => JSON.parse(f === '-' ? readFileSync(0, 'utf8') : readFileSync(f, 'utf8'));
async function getDoc(col, id) { const rows = await req(`${base}?${uid}&path=eq.${encodeURIComponent(col + '/' + id)}&deleted=is.false&select=data`); return rows[0] ? rows[0].data : undefined; }
async function write(col, id, data, deleted = false) {
  if (!ID.test(col) || !ID.test(id)) { console.error('bad collection or id (allowed: letters, digits, _ - . ~ : @ +)'); process.exit(2); }
  await req(base + '?on_conflict=user_id,path', { method: 'POST', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ user_id: LG_USER_ID, path: col + '/' + id, col, data: deleted ? null : { ...data, updated: new Date().toISOString() }, updated: Date.now(), deleted }]) });
}

const [cmd, a, b, c] = process.argv.slice(2);
switch (cmd) {
  case 'cols': {
    const rows = await req(`${base}?${uid}&deleted=is.false&select=col&limit=100000`); const n = {};
    for (const r of rows) n[r.col] = (n[r.col] || 0) + 1; console.log(JSON.stringify(n, null, 1)); break;
  }
  case 'list': {
    const rows = await req(`${base}?${uid}&col=eq.${encodeURIComponent(a)}&deleted=is.false&select=path,data->>title,data->>date,data->>status&order=server_ts.desc&limit=${Number(b) || 500}`);
    for (const r of rows) console.log([r.path.split('/')[1], r.status, r.date, r.title].filter(Boolean).join('  ·  ')); break;
  }
  case 'get': { const d = await getDoc(a, b); if (d === undefined) { console.error('not found'); process.exit(1); } console.log(JSON.stringify(d, null, 1)); break; }
  case 'dump': {
    const rows = await req(`${base}?${uid}&col=eq.${encodeURIComponent(a)}&deleted=is.false&select=path,data&order=server_ts.desc&limit=${Number(b) || 500}`);
    console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.path.split('/')[1], r.data])), null, 1)); break;
  }
  case 'put': await write(a, b, readJson(c)); console.log('ok'); break;
  case 'patch': { const cur = (await getDoc(a, b)) || {}; await write(a, b, { ...cur, ...readJson(c) }); console.log('ok'); break; }
  case 'del': await write(a, b, null, true); console.log('ok'); break;
  default: console.error('usage: see the top of scripts/db.mjs'); process.exit(2);
}
