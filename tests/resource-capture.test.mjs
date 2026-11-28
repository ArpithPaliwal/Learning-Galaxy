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

test('Library News cards can be saved and identify any existing course module location', () => {
  for (const marker of [
    'function resourceCourseLocations(',
    'saveResourceButton(x.title||x.url,x.url',
    'resourceCourseLocations(x.url,x.videoId',
    'newsCourseFlag(coursePlaces)'
  ]) assert.ok(html.includes(marker), `missing Library News behavior: ${marker}`);
});

test('Library Paths can save whole paths and linkless steps to buckets or courses', () => {
  for (const marker of [
    "saveResourceButton(title,'','path'",
    "saveResourceButton(st.t,st.url,'path-step'",
    "data-save-summary",
    'resource.summary||'
  ]) assert.ok(html.includes(marker), `missing Library Paths save behavior: ${marker}`);
});

test('Library News uses a compact course-presence flag with a location when present', () => {
  for (const marker of [
    'function newsCourseFlag(',
    'newsCourseFlag(coursePlaces)',
    'Not in course',
    'In: '
  ]) assert.ok(html.includes(marker), `missing Library News presence flag: ${marker}`);
});

test('Library News identifies whether an item is in any path, with all matching locations', () => {
  for (const marker of [
    'function resourcePathLocations(',
    'function pathPresenceFlag(',
    'resourcePathLocations(x.url,x.videoId',
    'pathPresenceFlag(pathPlaces)',
    'Not in path',
    'Present in:'
  ]) assert.ok(html.includes(marker), `missing Library News path-presence behavior: ${marker}`);
});

test('courses can be created manually without invoking AI course drafting', () => {
  for (const marker of [
    'id="manualCourseBtn"',
    'function createManualCourse(',
    "status:'ready'",
    'modules:[]',
    'createManualCourse(title.trim())'
  ]) assert.ok(html.includes(marker), `missing manual course creation behavior: ${marker}`);
});

test('path presence uses normalized identity and reports every matching path or track', () => {
  const start=html.indexOf('function resourceIdentity('), end=html.indexOf('function saveResourceButton(',start);
  assert.ok(start>=0&&end>start,'resource identity and presence helpers are available');
  const collections={paths:new Map([
    ['p1',{title:'AI Path',steps:[{t:'Intro',url:'https://example.com/news?utm_source=path'}]}],
    ['p2',{title:'Research Path',steps:[{t:'Read citation',links:[{url:'https://example.com/news'}]}]}],
    ['p3',{title:'Video Path',steps:[{t:'Watch',url:'https://www.youtube.com/watch?v=abcdefghijk'}]}]
  ]),tracks:new Map([['t1',{title:'Academy Track',steps:[{t:'Review',url:'https://example.com/news?fbclid=qa'}]}]])};
  const C=name=>collections[name]||new Map();
  const safeUrl=url=>{const value=String(url||'').trim();return value.startsWith('https://')||value.startsWith('http://')?value:'';};
  const ytId=(url,explicit='')=>{const x=String(explicit||url||'');if(/^[A-Za-z0-9_-]{11}$/.test(x))return x;try{const u=new URL(x),id=u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop();return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:'';}catch{return '';}};
  const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source=html.slice(start,end);
  const helpers=new Function('C','safeUrl','ytId','esc',source+';return {resourcePathLocations,pathPresenceFlag};')(C,safeUrl,ytId,esc);
  const found=helpers.resourcePathLocations('https://example.com/news?utm_campaign=qa');
  assert.deepEqual(found.map(x=>[x.type,x.path,x.step]),[
    ['Path','AI Path','Intro'],['Path','Research Path','Read citation'],['Track','Academy Track','Review']
  ]);
  assert.match(helpers.pathPresenceFlag(found),/✓ Path: AI Path → Intro \+2/);
  assert.match(helpers.pathPresenceFlag(found),/Research Path/);
  assert.match(helpers.pathPresenceFlag([]),/Not in path/);
  assert.deepEqual(helpers.resourcePathLocations('https://youtu.be/abcdefghijk').map(x=>x.path),['Video Path']);
});

test('manual course creation saves a ready blank course without calling AI', async () => {
  const start=html.indexOf('async function createManualCourse('), end=html.indexOf('async function createCourse(',start);
  assert.ok(start>=0&&end>start,'manual course creation is implemented');
  const source=html.slice(start,end);
  assert.doesNotMatch(source,/requestClaudeCourse|draftCourse|sample\\.json/);
  const state={db:{},course:null},courses=new Map();let saved=null,tab='';
  const create=new Function('S','C','toast','put','slug','rid','nowIso','setTab',source+';return createManualCourse;')(
    state,name=>name==='courses'?courses:new Map(),()=>{},async(collection,id,data)=>{saved={collection,id,data};},value=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-'),()=> 'abc12',()=> '2026-01-01T00:00:00.000Z',value=>{tab=value;}
  );
  const id=await create('My Own Course');
  assert.equal(saved.collection,'courses');
  assert.equal(saved.data.title,'My Own Course');
  assert.equal(saved.data.status,'ready');
  assert.deepEqual(saved.data.modules,[]);
  assert.equal(saved.data.source,'manual');
  assert.equal(state.course,id);
  assert.equal(courses.get(id).title,'My Own Course');
  assert.equal(tab,'courses');
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
