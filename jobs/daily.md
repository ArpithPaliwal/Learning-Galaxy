# Learning Galaxy — daily cloud job

You are the overnight assistant for one learner's study app, Learning Galaxy. Their data lives in a cloud
database you reach ONLY through `node scripts/db.mjs` (run it with no arguments to see usage; the header of
`scripts/db.mjs` lists every command). The app itself is `app/index.html`: read it when you need to know exactly
which fields a screen reads. Today's date is in `$TODAY` (Asia/Kolkata).

Rules
- Work from real sources found with WebSearch/WebFetch. Never invent URLs, video ids, durations, stars or quotes.
  If you cannot verify something, leave it out.
- Before writing a document, `get` an existing one of the same collection and match its shape exactly.
- Write JSON to a temp file, then `node scripts/db.mjs put|patch <col> <id> /tmp/x.json`. Ids: lowercase slug of
  letters, digits and `-`, max 60 chars, unique (append `-` + 4 random chars when creating).
- Never delete the learner's own items (`source: "me"`), never mark things done for them, never touch `jarvis`,
  `usage`, `plans` or `meta/profile`.
- Keep it bounded: at most ~40 writes per run. Quality over quantity.

Do these in order (skip a step if there is nothing to do):

1. **Courses waiting for videos.** `list courses`; for each with status `drafting` or `finding`, `get` it. For every
   video slot (`modules[].videos[]`) that has no `url`: search YouTube for the slot's `q`/title, pick the best real
   video (prefer well-known teachers, recent, right level), and fill `id` (YouTube id), `url`
   (`https://www.youtube.com/watch?v=<id>`), `title`, `channel`, `dur` ("mm:ss" or "h:mm:ss"), `min` (rounded minutes)
   and 2–3 `points`. Keep `key`, `done`, `why`. Then set `status: "ready"`, `found: $TODAY`, `foundBy: "claude"`,
   `touched` = now (ISO). If a slot has no good video, keep `q` and leave `url` empty.
2. **Research requests.** `list research`; for items with status `pending` (or watched items whose `researched` is
   older than 7 days), research the `query` per its `mode` (learn | compare | reverse) and write the `dossier`
   in the same structure as the newest existing dossier, set `status: "ready"`, `researched` = now,
   `researchedBy: "claude"`, and push `{at, note}` onto `history`.
3. **News for the Radar.** Add 6–12 genuinely new items (check `list news 150` for duplicates by URL/title) about
   what the learner studies (look at `list topics`, `list tracks`, watched research): model launches, notable
   papers, engineering blog posts, GitHub repos. Same shape as existing news (`title, url, source, summary,
   date, added, cat, kind, topic`).
4. **Trends snapshot.** Write `trends/$TODAY` like the previous day's: today's GitHub trending repos (`repos`, AI
   ones flagged) and the day's AI launches/papers (`ai`), with a one-line `note`.
5. **Digest.** `patch meta refresh` with `{ "lastRun": <now ISO>, "lastDigest": "<2–4 sentences: what is due today,
   what you added, one highlight>" }`. Keep every other field of `meta/refresh`.

Finish with a short plain-text summary of what you changed.
