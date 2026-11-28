# Handoff — where Learning Galaxy stands (for Claude, next session)

Last updated: 2026-11-22. Read this first, then `CLAUDE.md` (architecture) and `docs/SETUP.md` (human setup).

## What exists
| Piece | Where | State |
|---|---|---|
| Code | github.com/ArpithPaliwal/Learning-Galaxy (PUBLIC, `main`) · local `C:\Users\arpit\learning-galaxy` | v2 PWA. Old Gist version kept at tag `v1-gist`. |
| Hosting | Netlify site `learning-galaxy-arpit` (id `ee2077a9-b3b8-4c62-9a69-23b7bfd42ab6`) → https://learning-galaxy-arpit.netlify.app | Live. Deployed by uploading via the Netlify MCP (`deploy-site` → `npx @netlify/mcp … --site-id …`). Repo linked: pushes to main deploy automatically. Check: `gh api repos/ArpithPaliwal/Learning-Galaxy/hooks` or push and see if a deploy appears. |
| Database | Supabase org `pckmexwjhbbqdmhecrgp` ("Arpit Personal"), project `learning-galaxy`, ref `aqkiczctlqpkbhzucxmp`, region ap-south-1 (free) | Table `lg_docs` + RLS + trigger applied (`supabase/migrations/`). Auth site URL + redirects pushed (`supabase/config.toml`). URL + anon key baked into `app/config.js` (public by design). |
| DB password | `C:\Users\arpit\Documents\learning-galaxy-supabase-db-password.txt` (line 2) | Needed for `supabase db push --remote -p …`. Never print or commit it. |
| GitHub secrets | `CLAUDE_CODE_OAUTH_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Set. **`LG_USER_ID` missing** → cloud job fails its setup check until set. |
| Actions permissions | write + "allow Actions to create/approve PRs" | Enabled (user ran it). |
| Old data | `C:\Users\arpit\Documents\learning-galaxy-backup.json` (1,261 docs from the claude.ai artifact) | User chose to **start fresh**; do not import unless asked. Never commit (public repo). |

## Not done yet (in order)
1. **Netlify auto-deploy**: confirm the repo is linked (needed so Claude's shipped features go live). Until then redeploy with the Netlify MCP after each push.
2. **User signs in once** in the app (⚡ App → Cloud sync → email → open the magic link on that device). Then ask
   the user for their UID (Supabase dashboard → Authentication → Users) and run
   `printf '%s' '<uid>' | gh secret set LG_USER_ID -R ArpithPaliwal/Learning-Galaxy`. (The service key is only in
   GitHub secrets, which can't be read back.)
3. **AI key**: user pastes their own key in ⚡ App → AI brain on each device (deliberately never through chat/repo).
4. **First end-to-end tests** (none done live yet): Jarvis chat with a real key; sync between two devices; a `build_feature` round trip (issue → feature-request.yml → PR merged → deploy); `cloud-job.yml` run (Actions → Cloud job → Run workflow).
5. Old claude.ai routine `trig_013hyw8ZRU23tQRtfJcheMZj` still writes to the old artifact; turn it off once the cloud job works. Old GitHub Pages site (arpithpaliwal.github.io/Learning-Galaxy) now 404s; can be disabled.

## Gotchas learned
- Interactive logins (`claude setup-token`, `supabase login`) fail via `!` in Claude Code (no TTY): ask the user to run them in their own PowerShell.
- Supabase CLI (v3.2.0, `npx -y supabase@3.2.0`) needs `--yes` for hosted changes and the user's explicit OK first; `db push` needs `--remote -p <pw>`; `config push` only changes declared properties.
- Supabase free plan: custom email templates are refused (no 6-digit code in emails) → sign-in is by magic link; the app reads `#access_token` on load (`Sync.handleRedirect`).
- Auto-mode blocks reading credential stores and changing repo security settings: ask the user to run those.
- Headless Edge screenshots can't go below ~500px wide; a "390px" shot is cropped, not a real overflow.
- Repo is public: scan for personal data before pushing (`grep -ri "gmail\|sk-ant\|github_pat" app scripts`).

## Handy commands
```
cd C:\Users\arpit\learning-galaxy
npm run check && npm test && npm run build     # must pass before pushing
npm run dev                                     # http://localhost:5173
npx -y supabase@3.2.0 projects list             # CLI is logged in on this PC
gh secret list -R ArpithPaliwal/Learning-Galaxy
gh run list -R ArpithPaliwal/Learning-Galaxy
```

## UI redesign "Deep space blue" (done and deployed 2026-11-22)
User picked mockup C2 (black + faint stars, deep-blue hero), loves blue, wants a light theme, phone/tablet/PC.
- `app/theme.css` is the design layer, loaded after index.html's own CSS. Dark + light tokens; `.now`, `.stage`, `.space` stay "night sky" in both themes.
- index.html CSS colours were turned into tokens (`rgb(var(--c-acc) / a)` etc.); canvas JS colours were left alone.
- Theme: `html[data-theme]` = light/dark, none = follow device. Set early by an inline head script from localStorage `lg.app.theme`; toggle in the top bar and ⚡ App → Overview.
- Layout: ≥1101px left sidebar; tablet top bar; phone bottom tabs. On phone `.top` must not have backdrop-filter (it traps the fixed tab bar).
- Reviewed with headless-Edge screenshots, both themes, 1440/820/500px, real data (seed via a temporary dist/seed.js, then deleted).
- Not done: Today·Learn·Jarvis·Radar·Library tab restructure (proposed only); inner screens (Skill Map, Radar, Courses, Library, Labs) re-skinned but not individually reviewed in the light theme. Mockups: `.superpowers/brainstorm/` (gitignored).

## Signature visuals (done and deployed 2026-11-22)
- `app/lg-visuals.js`: Galaxy (top of Skill Map tab) and Radar (top of Radar tab), canvas, fed live from LG.store; animate only while visible; fewer particles on small screens.
- Galaxy: arms = categories; mastered near core, learning mid-arm (one pulsing ring on the current topic), todo outer, suggested faint at rim. Tap a star → `window.LGApp.openTopic(id)` (exposed in index.html before boot).
- Radar: sector = news kind (launch/repo/paper/article/practice), distance = age relative to newest item, blips flash as the beam passes, target lock = newest item whose `topic` matches a learning/todo topic.
- User rejected: generic restyles (calm dark, light-friendly, bento, aurora, electric), the bright/dense Jarvis orb, an original mask, and using a movie helmet image (deleted). Liked: realistic decluttered galaxy, radar v2. Jarvis look is still open.

## Radar theme (v4, deployed 2026-11-22)
User: "radar is good, galaxy isn't; make the whole app the radar theme; make Jarvis cool".
- `app/theme-radar.css` (after theme.css; dark theme only): navy radial bg (#0b2a4a→#041326→#01040c), cyan #5EC8FF hairlines, faint rings + slow sweep behind the app, mono uppercase readout labels (JetBrains Mono), sonar "Up next" card, mini-sonar `.rx` orbs.
- Dark tokens in theme.css switched to the radar palette.
- Skill Map galaxy replaced by a radar-style **skill chart** (lg-visuals.js `mountGalaxy`): sectors = categories, rings = Mastered/Learning/Bucket/Suggested.
- Jarvis: `.j-core` sonar canvas above the chat; reads state from `#jSub` text and `#orb.busy`.
- Theme init always sets `data-theme` (system mode resolves via matchMedia and follows changes).
- Not reviewed yet: light theme with the new screens, phone layout of the skill chart / Jarvis core.

## AI providers + feature requests (2026-11-22)
- AI works with any provider: 20 presets in `lg-runtime.js` (PROVIDERS; same list as Expenses), protocols openai/anthropic/gemini, custom auth/path/query/headers, key-prefix detection, relay `netlify/functions/ai-proxy.ts` (`/api/ai-proxy`, same-origin only, no private hosts) used automatically when a provider blocks browsers (remembered in `lg.app.ai.proxy`). Verified live: relay reaches Groq.
- Claude subscription can NOT power in-app chat (only Claude Code in GitHub Actions for feature builds). Offered: publish as a claude.ai artifact so Jarvis runs on the user's Claude account; not done yet.
- "Request a feature" (✨ button / sidebar) matches Expenses: Builder Claude/Copilot/Save only, Model Sonnet/Opus/Haiku, When Ship now/Within 6h. No live end-to-end build test yet.
- Skill Map = 3D holo-table; canvases are theme-aware (kit() in lg-visuals.js).

## Verification pass (2026-11-22)
- Install: live manifest (standalone, 192/512/maskable icons) + service worker served; SW registers on the live site.
- Sync: `tests/sync.test.mjs` (two devices through a fake Supabase). Fixed: run() now awaits in-flight/queued passes; tie-break matches the server trigger (incoming wins unless local change is unsent). Live DB: table exists, anon sees nothing (RLS), email sign-in on. A live two-device test with a temp user was blocked by auto-mode (needs the user's OK) — the user's own sign-in is the real test.
- Cloud job no longer needs LG_USER_ID (db.mjs finds the single user).
- Netlify "Powered by Netlify" badge hidden: `<div id="nl-hud-frame" hidden>` + `#nl-badge-frame` make Netlify's injected HUD script skip itself (it checks these ids). Confirmed no badge iframe live.
- Feature pipeline test: issue #1 "Daily quote under the greeting on Today" filed to exercise build → test → merge.
- Netlify repo LINKED (2026-11-22): every push to main deploys automatically (verified). No more manual deploys needed.

## Daily automation (2026-11-22)
| Time (IST) | Workflow | What | Needs |
|---|---|---|---|
| 06:00 | `daily-feed.yml` | Claude researches GitHub trending, AI news, tools, YouTube videos → `app/feed/latest.json` (validated by `scripts/validate-feed.mjs`; keeps yesterday's if invalid) → commit → Netlify deploys | CLAUDE_CODE_OAUTH_TOKEN only |
| 06:30 | `cloud-job.yml` | Personal data: course videos, research dossiers, digest (writes to Supabase via `scripts/db.mjs`) | a signed-in user (skips quietly until then) |
| on issue | `feature-request.yml` | Builds requested features, tests, merges → Netlify deploys | done/verified (issue #1 → PR #2) |
- App side: `LG.loadFeed()` merges the public feed into news/trends on load and every 3h (non-dirty, not uploaded).
- Radar has "AI tools" and "Videos" filters (`newsTag`: kind tool/video).

## Artifact edition (2026-11-22)
- New claude.ai artifact **https://claude.ai/artifact/KvHsU3xGV7uhVAPyPmvJDb** (private). Same code as the app; `npm run build:artifact` → `dist-artifact/page.html` (+ `feed/latest.json`), published with the Artifact tool, capabilities `db, sample{images}, downloads, dictation, tts`. The old artifact (33yxqUEtvDXdECHUcWtDf5, v1 HUD + the user's original data) was left untouched (overwriting it needs reading all 2,196 lines).
- Runtime: `lg-runtime.js` keeps the platform `window.claude` when present (`LG.ARTIFACT`), mirrors the artifact db via `artifactStore()`; Jarvis = viewer's Claude account (no key); Supabase sync is OFF there because claude.ai blocks network calls to other hosts (fetch/XHR/WebSocket). Feature requests become a GitHub "new issue" link.
- Data bridge between editions = backup file: ⚡ App → Data → Download / Import (both editions). A live artifact⇄Supabase sync is impossible; an on-request bridge by Claude (ArtifactData ↔ Supabase REST) is possible.
- Republishing: edit app/, `npm run build:artifact`, copy dist-artifact/* into the scratchpad, publish `page.html` to the same file path/URL with `files` for the feed.

## Brain + glass redesign (2026-11-28)
- Backup before this change: folder `C:\Users\arpit\learning-galaxy-backup-2026-11-28` + git tag `backup-before-brain-merge-2026-11-28`.
- Skill Map tab is now **Brain**: 3D graph / Kanban (horizontal × vertical) / Overview (old map). See CLAUDE.md → lg-brain.js.
- User chose: keep Supabase as the live DB (web + phone); **mirror to an Obsidian vault nightly** (scripts/mirror-obsidian.mjs, see docs/OBSIDIAN.md); start fresh with the AI Brain curriculum (106 topics, 11 tracks).
- Deep research from the Brain queues `research` docs with a `topic` field; jobs/daily.md step 2 now also patches that topic.
- Not done: Jarvis actions for H/V lanes; live test of arXiv relay on Netlify.
