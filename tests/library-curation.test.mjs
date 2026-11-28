import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const app = html;

test('manual buckets and Instagram links use independent synced collections and Library sections', () => {
  assert.ok(/\bCOLS\s*=\s*\[[^\]]*'buckets'[^\]]*'instagram'/s.test(app));
  for (const section of ['buckets', 'instagram', 'ig-research']) {
    assert.ok(new RegExp(`data-sub=["']${section}["']`).test(app));
  }
  assert.ok(/s\s*===\s*'buckets'/.test(app));
  assert.ok(/s\s*===\s*'instagram'/.test(app));
  assert.ok(/s\s*===\s*'ig-research'/.test(app));
});

test('manual bucket records support editable classification and multiple resource links', () => {
  for (const r of [/data-bucket-add/, /data-bucket-edit/, /Tool|tool/, /data-bucket-kind/, /data-bucket-resources/]) assert.ok(r.test(app));
});

test('Instagram records accept Reel context and resources, queue linked research, and support AI classification', () => {
  for (const r of [/Instagram Reel URL/, /caption or transcript/i, /additional resource links/i, /data-ig-research/, /source:\s*'instagram'/, /igId/, /Instagram research/i, /aiKind/, /aiKindReason/]) assert.ok(r.test(app));
});

test('Instagram links and research are not mixed into the manual Bucket or general research list', () => {
  assert.ok(/source\s*!==\s*'instagram'/.test(app));
  assert.ok(/source\s*===\s*'instagram'/.test(app));
});
