# Learning Galaxy — daily public feed

You refresh `app/feed/latest.json`, the public "what's moving in AI" feed shown on the app's Radar tab.
It is not personal: it is published with the app. Today's date (Asia/Kolkata) is in `$TODAY`.

The learner studies: LLMs from scratch (transformers, training small models), LLM agents and tool calling,
RAG, AI systems and inference, system design, DSA. Favour items useful to them.

## Steps
1. **GitHub trending:** WebFetch `https://github.com/trending?since=daily`. Take the listed repos (up to 16) with
   owner/name, description, language, total stars, stars today, URL. Set `ai: true` for AI/ML/LLM/agent repos.
2. **AI news (last ~48h):** WebSearch for today's AI news, model launches, notable papers and engineering posts.
   8–12 items. Prefer the original source (company blog, arXiv, GitHub). If you only have an aggregator,
   start the summary with "Reported:" and name the aggregator as `source`.
3. **AI tools (5–8):** newly launched or trending AI tools/products/libraries worth trying (can include trending repos).
4. **Videos (4–8):** real YouTube videos (`https://www.youtube.com/watch?v=<11-char id>`) relevant to the learner,
   preferring the last few weeks; classics are fine for their courses. Only include ids you saw in search results
   or pages. Never invent an id.
5. Write the JSON (schema below) to `app/feed/latest.json`, then run `node scripts/validate-feed.mjs` and fix
   every error until it prints ✓.

## Rules
- Never invent URLs, numbers, dates or quotes. If unsure, leave the item out.
- Summaries: 1–2 plain sentences, why it matters. No hype.
- Ids: lowercase slugs, unique, prefixed `feed-<YYYYMMDD>-`.
- Do not touch any other file.

## Schema
```json
{
  "date": "YYYY-MM-DD", "generated": "<ISO time>", "note": "one line about sources",
  "news":   [{ "id": "feed-YYYYMMDD-slug", "kind": "launch|article|paper|repo", "cat": "ai|sys", "source": "…", "title": "…", "summary": "…", "url": "https://…", "topic": "closest study topic" }],
  "tools":  [{ "id": "…", "kind": "tool", "cat": "ai", "source": "…", "title": "…", "summary": "…", "url": "https://…", "topic": "…" }],
  "videos": [{ "id": "…", "kind": "video", "cat": "ai", "source": "YouTube · <channel>", "title": "…", "summary": "…", "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX", "topic": "…" }],
  "trends": { "source": "github.com/trending (daily)", "note": "…",
    "repos": [{ "name": "owner/repo", "desc": "…", "lang": "…", "stars": 0, "today": 0, "ai": true, "url": "https://github.com/owner/repo" }],
    "ai":    [{ "kind": "launch|paper", "source": "…", "title": "…", "summary": "…", "url": "https://…" }] }
}
```
Finish with a 2-line summary of what you published.
