# Learning Galaxy

Your study galaxy as a self-hosted app. **Nothing here needs Claude**: you bring your own AI key (any provider, or a local model), your own GitHub Gist for sync, your own free GitHub Action for the overnight work, and your own Notion / Google Drive tokens for the book.

- `index.html` is the whole app as one file. GitHub Pages serves it, so it opens on any phone, tablet, laptop or TV browser.
- `bot/galaxy-bot.mjs` together with `.github/workflows/learning-galaxy-bot.yml` is a free daily bot. It runs in GitHub Actions and does four things:
  - adds fresh news (GitHub repos, Hacker News, arXiv, engineering blogs)
  - imports path steps from links
  - sends the morning digest to your phone
  - writes the Sunday weekly report
  - turns links in your **Inbox** (YouTube, Instagram reels, arXiv, GitHub, articles) into study kits: subject, summary, key points with timestamps, topics, flashcards, a study plan and resources. It reads YouTube captions, reel captions, abstracts and READMEs
  - saves a **Trending** snapshot: GitHub's daily trending repos (AI ones flagged) plus the day's AI launches and papers
  - writes your **Research dossiers** overnight from real sources (Wikipedia, GitHub search, arXiv, Hacker News) plus your AI model, applies "improve" requests and refreshes watched dossiers every Sunday
  - files **My book** in Notion and/or Google Drive every Sunday (or on demand from the app)
  - keeps the **AI Academy** tracks current: it applies your open suggestions and adds steps or links when the news shows something genuinely new (only trusted links: official docs, GitHub, arXiv, news it found; videos as YouTube searches; it never edits steps you wrote or finished)
- Your data lives in **one private GitHub Gist**. The app and the bot both read and write it, so every device stays in sync.

The bot works with any of these AI providers: OpenAI, Anthropic (Claude), Google Gemini, OpenRouter, Groq, or any OpenAI-compatible endpoint. In the app, each person picks their own provider in Settings. That choice is separate from the bot's.

---

## Setup (about 10 minutes)

### 1. Create the repo and turn on Pages
1. Create a new GitHub repo, for example `learning-galaxy`. It can be private if your plan allows Pages on private repos; otherwise make it public. Your data is never in the repo; it lives in the private Gist.
2. Upload everything in this folder, keeping the `.github` folder.
3. Go to **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
4. Your app is now at `https://<you>.github.io/learning-galaxy/`. Add it to your phone's home screen.

### 2. Make a GitHub token
Create a **fine-grained token** at github.com → Settings → Developer settings → Fine-grained tokens.
- **Account permissions → Gists: Read and write**
- **Repository access → only `learning-galaxy` → Actions: Read and write.** This lets the app's Refresh now button start the bot.

A classic token with the `gist` and `repo` scopes also works.

### 3. Create the Gist and connect the app
1. Open your app, go to **Settings → GitHub Gist sync**, and paste the token.
2. Leave **Gist ID** empty and click **Push now**. The app creates a private gist and fills in its ID.
3. Auto-sync turns itself on after the first push. Put `<you>/learning-galaxy` in **Bot repo**. The whole data file (every collection, plus deletions) is pulled on open, every minute and whenever you return to the tab, and pushed about 5 seconds after any change.
4. Moving from the claude.ai version? Click **Export backup** there, then **Import backup** here, then **Push now**.

### 4. Give the bot its secrets
In the repo, go to **Settings → Secrets and variables → Actions**.

**Secrets**

| Name | Value |
|---|---|
| `GIST_ID` | the Gist ID shown in the app's Settings |
| `GIST_TOKEN` | the token from step 2 |
| `LLM_API_KEY` | your AI provider key (skip it for a keyless local endpoint) |
| `NTFY_TOPIC` | optional: a long random name like `arpith-galaxy-7f3k9`, for phone notifications |
| `YT_API_KEY` | optional: a YouTube Data API key, for the most reliable playlist imports |
| `NOTION_TOKEN` | optional: Notion integration secret (book copy) |
| `GDRIVE_CLIENT_ID` / `GDRIVE_CLIENT_SECRET` / `GDRIVE_REFRESH_TOKEN` | optional: Google Drive book copy from the bot |

**Variables**

| Name | Example |
|---|---|
| `LLM_PROVIDER` | `openai`, `anthropic`, `gemini`, `openrouter`, `groq` or `custom` |
| `LLM_MODEL` | any model your key can use, e.g. `gpt-4o-mini`, `gemini-2.5-flash`, a Claude model ID |
| `LLM_BASE_URL` | only for `custom` (any OpenAI-compatible `/v1` URL) |
| `APP_URL` | your Pages URL; tapping a notification opens the app |
| `TIMEZONE` | defaults to `Asia/Kolkata` |
| `EXTRA_FEEDS` | optional: comma-separated RSS/Atom feed URLs to watch |
| `NOTION_PAGE_ID` | optional: the Notion page the book goes under |
| `GDRIVE_FOLDER_ID` | optional: Drive folder for the book |

### 5. Phone notifications (free, no account)
Install the **ntfy** app (Android or iOS) and subscribe to the same topic name you put in `NTFY_TOPIC`. Anyone who knows the topic name can read it, so keep it long and random.

### 6. Test it
Go to **Actions → Learning Galaxy bot → Run workflow**, choose `both`, and wait about a minute. In the app, go to **Settings → Pull now**. News, the digest and the report should appear.

---

## Send links from your phone (Instagram, YouTube, anywhere)
- **Android:** open your app URL in Chrome → menu → **Install app**. Learning Galaxy then appears in the **Share** sheet: in Instagram tap Share → Learning Galaxy, add a note, tap *Add*. Auto-sync pushes it to your Gist and the bot builds the study kit on its next run (or tap **Refresh now** on the News page).
- **iPhone:** make a Shortcut that takes *URLs* from the share sheet and opens `https://<you>.github.io/learning-galaxy/?add=` + the URL.
- **Better kits for reels:** Instagram only exposes the caption, not the video. Add a one-line note ("explains KV cache") or paste the caption/transcript for the best result.
- With an AI key set in the app's Settings, **Add & build study kit now** builds the kit instantly in the browser.


## My book in Notion and Google Drive (optional, no Claude)
The app always lets you **download the book as .txt or .md**, and every Gist sync also saves it as `learning-galaxy-book.md` in your Gist. For Notion and Drive copies:

**Notion (through your bot; Notion doesn't allow direct browser calls)**
1. Go to notion.so/my-integrations → **New integration** (internal) → copy the secret.
2. Make a page such as "Learning Galaxy" → **⋯ → Connections → add your integration**. Copy the page ID (the 32-character code at the end of its URL).
3. In the repo, add the secret `NOTION_TOKEN` and the variable `NOTION_PAGE_ID`.
4. Every Sunday, or when you tap **My book → Save to Notion**, the bot writes a fresh "Learning Galaxy Book" page under it and archives the previous one.

**Google Drive, option A: straight from the app**
1. console.cloud.google.com → create a project → **APIs & Services → Enable APIs → Google Drive API**.
2. **OAuth consent screen**: External, add yourself as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application**, and add your Pages address (e.g. `https://<you>.github.io`) under *Authorised JavaScript origins*.
4. Paste the client ID in the app under **Settings → Google Drive**, then tap **My book → Save to Google Drive**. It uses the `drive.file` scope, so the app can only see the file it creates.

**Google Drive, option B: weekly from the bot**
1. Create an OAuth client of type **Desktop app** in the same project.
2. Get a refresh token with the [OAuth Playground](https://developers.google.com/oauthplayground): ⚙ → *Use your own OAuth credentials*, then scope `https://www.googleapis.com/auth/drive.file` → Authorize → Exchange.
3. Add the secrets `GDRIVE_CLIENT_ID`, `GDRIVE_CLIENT_SECRET` and `GDRIVE_REFRESH_TOKEN`. Optionally add the variable `GDRIVE_FOLDER_ID`.

## Everything works without Claude
| Feature | Standalone uses |
|---|---|
| AI (explain, tutor, flashcards, kits, plans, interviews, dossier drafts) | your provider in Settings: OpenAI, Anthropic, Gemini, OpenRouter, Groq, Ollama / LM Studio (local, free), any OpenAI-compatible URL |
| Sync between devices | your private GitHub Gist |
| Morning digest, news, Trending, Inbox study kits, path imports, Academy updates, overnight research, weekly report | the GitHub Action bot in this repo |
| Phone notifications | ntfy (free) |
| Refresh now / Save to Notion buttons | the app starts your bot through the GitHub API |
| Book copies | .txt / .md download, Gist, Notion (bot), Google Drive (app or bot) |
| Share to the app from Instagram / YouTube | the PWA share target (Android) or an iOS Shortcut |
| Full Striver A2Z sheet, 11 Academy tracks | built into the app |

## When it runs
- **Every day at 06:52 IST:** it imports any pending path links and adds 8–14 news items plus a DSA problem and a design exercise. It may suggest up to 3 topics, removes news older than 45 days that you haven't saved, and sends the digest.
- **Every day** it also processes queued research dossiers (up to 4 per run).
- **Sundays at 18:47 IST:** it writes the weekly report (shown under Progress and on Today), refreshes watched dossiers, files the book in Notion/Drive and sends a short summary.
- **Whenever you click Refresh now** on the News page.

GitHub may start scheduled runs a few minutes late. To change the times, edit the two `cron` lines; they are in UTC.

## How the sync works
- Each item keeps an `updated` time. When the app or the bot merges, the newer copy wins, and nothing you add on one device overwrites newer work from another.
- Focus sessions from different devices are combined.
- When the bot removes old news, the app drops it too.

## Costs
GitHub Actions, Pages, Gists and ntfy are free at this size. The bot makes about two AI calls a day, plus one per study kit or dossier, plus one on Sundays. With a small model like `gpt-4o-mini`, `gemini-2.5-flash` or Haiku, that is a few cents a month.
