# Learning Galaxy — setup

The app works the moment it's deployed: data is saved on each device. The steps below add the AI brain,
cloud sync between devices, and "Claude builds it" feature requests. Do them once.

## 1. Open and install the app
Open https://learning-galaxy-arpit.netlify.app
- **Android / Chrome / Edge:** menu → **Install app** (or the ⚡ App panel → Install).
- **iPhone / iPad (Safari):** Share → **Add to Home Screen**.
- **Windows / Mac (Chrome or Edge):** the install icon in the address bar.

## 2. Bring your data over
Your old claude.ai data was exported to `Documents\learning-galaxy-backup.json` on your PC.
⚡ App → **Data** → **Import a backup** → pick that file. (Do this on ONE device; sync copies it to the others.)

## 3. AI brain (Jarvis, courses, quizzes)
⚡ App → **AI brain** → provider **Claude (Anthropic)** → paste an API key from
https://console.anthropic.com/settings/keys → **Test**. The key stays on that device; repeat on each device.
Any OpenAI-compatible provider (OpenRouter, Gemini, OpenAI, Groq, local) works too: pick it and type a model name.

## 4. Cloud sync (Supabase, free)
1. Create a project at https://supabase.com (free plan, any region near you, e.g. Mumbai).
2. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → URL Configuration → Site URL** = `https://learning-galaxy-arpit.netlify.app`.
4. Optional, for 6-digit codes instead of links: **Authentication → Emails → Magic Link** template, add `{{ .Token }}`.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
6. In the app: ⚡ App → **Cloud sync** → paste both → Save → enter your email → **Email me a code** → sign in.
   (Or ask me to put the URL + anon key into `app/config.js` so every device is pre-filled; both are safe to publish.)
7. Sign in with the same email on every device.

## 5. Claude builds features (GitHub)
Repo secrets (GitHub → repo → Settings → Secrets and variables → Actions → New repository secret):
- `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` in a terminal and paste the result (uses your Claude plan).
Then Settings → Actions → General → Workflow permissions → tick **Allow GitHub Actions to create and approve pull requests**.

Now ask Jarvis "build me a …" or use ⚡ App → **Builder**. Without a GitHub token in the app, it opens a
prefilled issue for you to submit. To let Jarvis file builds by itself, create a
[fine-grained token](https://github.com/settings/personal-access-tokens/new): only this repository,
**Issues: Read and write**, **Actions: Read and write** → paste it in ⚡ App → Builder.

## 6. Daily cloud job (course videos, research, news, trends)
Add three more repo secrets:
- `SUPABASE_URL` — the Project URL from step 4.
- `SUPABASE_SERVICE_KEY` — Project Settings → API → **service_role** key (secret! only in GitHub secrets, never in the app).
- `LG_USER_ID` — Supabase → Authentication → Users → your user's **UID** (after you've signed in once).
It runs every morning at 06:30 IST, or from ⚡ App → Builder → "Run daily job now" (needs the GitHub token), or
GitHub → Actions → Cloud job → Run workflow.
