# Learning Galaxy — project guide

Personal study HUD (Iron Man–style): Today plan, Skill Map, Radar (news/trending), Courses (YouTube courses),
Library (topics, paths, research, DSA, tasks), Neural Lab, Training sim, and **Jarvis**, an AI assistant that can
operate the whole app through actions. Installable PWA, works offline.
Live: https://learning-galaxy-arpit.netlify.app (Netlify deploys every push to `main`). Setup for humans: `docs/SETUP.md`.
**Continuing work? Read `docs/HANDOFF.md` first** (current state, IDs, what is not done yet).

## Commands

```
npm run dev      # static server for app/ on http://localhost:5173
npm run check    # parses every script, checks script order / build_feature action / manifest
npm test         # node:test — store + runtime shim (tests/*.test.mjs)
npm run build    # copies app/ → dist/ and stamps the version into sw.js + config.js
npm run icons    # re-render app/icons/*.png
```

`check`, `test` and `build` must all pass before anything ships; the feature-request workflow enforces it.
No dependencies, no bundler. Don't add any without a strong reason.

## How it fits together

- `app/index.html` — the whole UI in one file (CSS + one inline script, an IIFE). It was written as a claude.ai
  artifact, so it talks to `window.claude.use(name)` for `db`, `sample` (AI), `mcp`, `downloads`, `dictation`, `tts`.
  - State: `S` object; collections in `S.col[name]` (Maps) via `C(name)`; `COLS` lists them.
  - Writes: `put(col,id,data)`, `patch(col,id,partial)`, `del(col,id)`. Rendering: push a function to `renderers`, call `render()`.
  - Jarvis: `jarvisAsk()`; its action list is `ACTION_HELP`, executed by `runActions()` (add new actions in both).
  - Modals: `openModal(html, onMount)`; toasts: `toast(msg)`; Markdown: `md(text)`; escaping: `esc()`.
- `app/lg-runtime.js` — provides `window.claude` outside claude.ai:
  - `db` → `app/lg-store.js` (in-memory + IndexedDB, Firestore-like API, `updated`/`dirty` per doc).
  - Cloud sync → Supabase table `lg_docs` (`supabase/schema.sql`), last writer wins, pull by `server_ts`.
  - `sample` → user's own AI key (Anthropic direct with the browser-access header, or OpenAI-compatible); tiers
    quick/default/complex → haiku/sonnet/opus.
  - `mcp.callTool('…','fire_trigger')` → GitHub Actions `cloud-job.yml` dispatch.
  - `dictation`/`tts` are null on purpose: the app falls back to the browser's SpeechRecognition / speechSynthesis.
  - `window.LG` — helpers for the App panel and Jarvis (`LG.requestFeature`, `LG.Sync`, `LG.GH`, `LG.cfg`).
- `app/lg-brain.js` — the **Brain** tab (data-tab `galaxy`): 3D knowledge graph (`vendor/3d-force-graph.min.js`; tracks on a
  ring = breadth, height = topic `level` 0-5 = depth), the **horizontal/vertical Kanban** (lanes Inbox/Backlog/Horizontal/
  Vertical/Review/Mastered derived from topic `status` + `mode` 'h'|'v' + `srs.due`; WIP limits; T-shape chart; "Plan my
  next moves"), the one topic editor drawer used everywhere (`openTopic` → `LGBrain.open`), in-browser research
  (Wikipedia, arXiv via `/api/research-proxy`, Semantic Scholar, GitHub, HN, HF + `S.sample` synthesis) and the
  AI curriculum seed `app/brain-seed.json` (written once per account, `meta/brainSeed`). It reaches the app only via
  `window.LGCore` (set at the end of index.html's inline script). Topic fields it adds: `level`, `prereqs[]`, `mode`,
  `kind`, `confidence`, `researched`. The seed is generated from `~/ai-brain` with `py brain.py export-lg`.
- `app/theme-glass.css` — glass layer (loaded last): frosted panels, nebula backdrop, Brain/Kanban/drawer styles.
- `app/lg-app.js` — the ⚡ App panel (AI key, sync sign-in, Builder, backup import/export), service-worker registration, update banner.
- `app/sw.js` — stale-while-revalidate app shell; the build stamps `CACHE` so each deploy purges the old cache.
- `scripts/db.mjs` — CLI to the cloud data (service key) used by the cloud job.
- `jobs/daily.md` + `.github/workflows/cloud-job.yml` — overnight job (course videos, research, news, trends, digest).

## Conventions

- Look: dark HUD, cyan glow. Use the CSS variables in index.html (`--accent`, `--fg-2`, `--line`, …) and the
  existing classes (`.card`, `.btn`, `.btn.primary`, `.iconbtn`, `.inp`, `.label`, `.pill`, `.row`, `.stack`).
- Mobile first: must fit a 360px phone; tabs become a bottom bar under 640px.
- Keep AI calls rare and small (user pays for their key). Set `S.feat = 'Name'` before a `S.sample` call so the token audit can attribute it.
- Never commit keys, tokens or personal data. User data lives in IndexedDB/Supabase only.
- Data ids: `[A-Za-z0-9_\-.~:@+]{1,200}`; use `slug(title)+'-'+rid()`.

## Feature requests from the app → shipped

1. ⚡ App › Builder, or Jarvis' `build_feature` action, opens a GitHub issue titled `Feature: …` whose body ends
   `Builder: Claude · Model: … · When: Now` and `Sent from the app`.
2. `.github/workflows/feature-request.yml` (owner/collaborator issues only) runs Claude Code headless on branch
   `feature/issue-N`, then check + tests + build. One automatic retry with the failure log.
3. Pass → PR squash-merged into `main` → Netlify deploys → issue commented "Shipped" and closed.
   Fail → draft PR, label `needs-human`. Comment `@claude …` on the issue to retry with more instructions.
4. Requires repo secret `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or `ANTHROPIC_API_KEY`, and
   Settings › Actions › General › "Allow GitHub Actions to create and approve pull requests".

When running inside that workflow: don't commit/push or edit `.github/` — the workflow does git itself.
