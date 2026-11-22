#!/usr/bin/env node
// Validates app/feed/latest.json (the public daily feed). Used by `npm run check` and the daily-feed workflow,
// so a bad research run can never ship a broken feed.
//   node scripts/validate-feed.mjs [path]
import { readFileSync } from 'node:fs';

export function validateFeed(f) {
  const errs = [];
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s));
  const isUrl = (s) => /^https:\/\/[^\s"'<>]+$/.test(String(s));
  if (!f || typeof f !== 'object') return ['feed is not an object'];
  if (!isDate(f.date)) errs.push('date must be YYYY-MM-DD');
  if (f.generated && isNaN(Date.parse(f.generated))) errs.push('generated must be an ISO time');
  const ids = new Set();
  const KINDS = { news: ['launch', 'article', 'paper', 'repo', 'practice'], tools: ['tool'], videos: ['video'] };
  for (const [list, kinds] of Object.entries(KINDS)) {
    if (!Array.isArray(f[list])) { errs.push(`${list} must be an array`); continue; }
    f[list].forEach((it, i) => {
      const at = `${list}[${i}]`;
      if (!it || typeof it !== 'object') { errs.push(`${at} is not an object`); return; }
      if (!/^[a-z0-9][a-z0-9-]{2,120}$/.test(String(it.id))) errs.push(`${at}.id must be a lowercase slug`);
      else if (ids.has(it.id)) errs.push(`${at}.id is duplicated: ${it.id}`); else ids.add(it.id);
      if (!it.title || String(it.title).length > 200) errs.push(`${at}.title missing or too long`);
      if (!isUrl(it.url)) errs.push(`${at}.url must be an https URL`);
      if (!kinds.includes(it.kind)) errs.push(`${at}.kind must be one of ${kinds.join('/')}`);
      if (it.summary && String(it.summary).length > 600) errs.push(`${at}.summary too long`);
      if (list === 'videos' && !/^https:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]{11}|youtu\.be\/[\w-]{11})/.test(String(it.url))) errs.push(`${at}.url must be a YouTube video link`);
    });
  }
  const t = f.trends;
  if (!t || !Array.isArray(t.repos)) errs.push('trends.repos must be an array');
  else t.repos.forEach((r, i) => {
    if (!/^[\w.-]+\/[\w.-]+$/.test(String(r.name))) errs.push(`trends.repos[${i}].name must be owner/repo`);
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(String(r.url))) errs.push(`trends.repos[${i}].url must be a github.com repo URL`);
  });
  if (t && t.ai && !Array.isArray(t.ai)) errs.push('trends.ai must be an array');
  const total = (f.news || []).length + (f.tools || []).length + (f.videos || []).length;
  if (total < 5) errs.push('feed is nearly empty (fewer than 5 items)');
  return errs;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('validate-feed.mjs')) {
  const path = process.argv[2] || 'app/feed/latest.json';
  let f; try { f = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { console.error('✕ ' + path + ' is not valid JSON: ' + e.message); process.exit(1); }
  const errs = validateFeed(f);
  if (errs.length) { console.error('✕ feed invalid:\n  - ' + errs.join('\n  - ')); process.exit(1); }
  console.log(`✓ feed ${f.date}: ${f.news.length} news, ${f.tools.length} tools, ${f.videos.length} videos, ${f.trends.repos.length} repos`);
}
