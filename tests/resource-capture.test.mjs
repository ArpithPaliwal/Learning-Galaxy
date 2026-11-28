import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

test('resources can be saved from cards into either manual buckets or a selected course location', () => {
  for (const pattern of [/function saveResourceButton\(/, /function openResourceSave\(/, /data-save-resource/, /data-save-destination/, /data-save-module/, /data-save-new-module/, /put\('buckets'/, /patch\('courses'/]) {
    assert.ok(pattern.test(html), `missing ${pattern}`);
  }
});

test('course lesson, Library video, topic resource, path resource, and Radar cards expose the shared save action', () => {
  for (const marker of [
    'saveResourceButton(real ? (v.title||v.q) : v.q',
    'saveResourceButton(v.title',
    'saveResourceButton(r.label',
    'saveResourceButton(st.t',
    'saveResourceButton(n.title',
    'saveResourceButton(p.title'
  ]) assert.ok(html.includes(marker), `missing save action at ${marker}`);
});

test('every curated playlist has a first-video ID to render a thumbnail', () => {
  const picks = JSON.parse(readFileSync(new URL('../app/ai-video-picks.json', import.meta.url), 'utf8'));
  for (const playlist of picks.playlists) {
    assert.match(playlist.firstVideoId || '', /^[A-Za-z0-9_-]{11}$/, `missing thumbnail video ID for ${playlist.title}`);
  }
});

test('video cards throughout the app use a shared thumbnail fallback for YouTube URLs and IDs', () => {
  for (const pattern of [/const ytThumb =/, /img\.youtube\.com\/vi\//, /const yt=ytThumb\(u,videoId,title\)/, /resourceThumbnail\(url, videoId/, /resourceThumbnail\(p\.url,p\.firstVideoId/, /resourceThumbnail\(u,item\.videoId/, /resourceThumbnail\(n\.url,n\.videoId/, /resourceThumbnail\(st\.url,st\.videoId/]) {
    assert.ok(pattern.test(html), `missing thumbnail coverage ${pattern}`);
  }
});
