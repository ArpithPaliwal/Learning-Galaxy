# Handoff — where Learning Galaxy stands (for Claude, next session)

Last updated: 2026-11-22. Read this first, then `CLAUDE.md` (architecture) and `docs/SETUP.md` (human setup).

## What exists
| Piece | Where | State |
|---|---|---|
| Code | github.com/ArpithPaliwal/Learning-Galaxy (PUBLIC, `main`) · local `C:\Users\arpit\learning-galaxy` | v2 PWA. Old Gist version kept at tag `v1-gist`. |
| Hosting | Netlify site `learning-galaxy-arpit` (id `ee2077a9-b3b8-4c62-9a69-23b7bfd42ab6`) → https://learning-galaxy-arpit.netlify.app | Live. Deployed by uploading via the Netlify MCP (`deploy-site` → `npx @netlify/mcp … --site-id …`). **Repo not confirmed linked** for auto-deploy (user step: Netlify → Project configuration → Build & deploy → Link repository). Check: `gh api repos/ArpithPaliwal/Learning-Galaxy/hooks` or push and see if a deploy appears. |
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
