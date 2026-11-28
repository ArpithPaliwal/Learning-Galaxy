# Obsidian mirror

Learning Galaxy keeps **Supabase** as the live database (website + phone). Every night at **23:30** a Windows
scheduled task mirrors everything into an **Obsidian vault** as plain markdown, then commits and pushes the vault to a
**private** GitHub repo.

| What | Where |
|---|---|
| Vault | `C:\Users\arpit\LearningGalaxyVault` (open it in Obsidian) |
| Private backup repo | https://github.com/ArpithPaliwal/learning-galaxy-vault |
| Mirror script | `scripts/mirror-obsidian.mjs` (this repo) |
| Scheduled task | "Learning Galaxy - Obsidian mirror" → `%LOCALAPPDATA%\learning-galaxy\mirror.cmd` |
| Credentials | `%LOCALAPPDATA%\learning-galaxy\mirror.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) — never commit |
| Log | `%LOCALAPPDATA%\learning-galaxy\mirror.log` |

Run it now: `node scripts/mirror-obsidian.mjs --vault "C:/Users/arpit/LearningGalaxyVault"`
(`--from-seed` renders the curriculum without touching Supabase.)

## Vault layout
- `Topics/<NN Track>/<Topic>.md` — YAML frontmatter (track, level, status, lane, prereqs, review_due, tags `lg/...`),
  explanation, your notes, resources, and `Question::Answer` flashcards (Spaced Repetition plugin, deck `#flashcards/lg`).
- `Kanban.md` (Kanban plugin board: Inbox / Backlog / Horizontal / Vertical / Review / Mastered), `Dashboard.md` (Dataview).
- `Courses/`, `Research/`, `Paths/`, `Plans/`, `Radar/<month>.md`, `Tasks.md`, `DSA.md`.
- `_backup/lg-YYYY-MM-DD.json` — full JSON snapshot of the cloud data (last 14 days; git-ignored: may contain settings).
- `My Notes/` — **yours**. The mirror never touches it. Everything else is regenerated nightly, so edit topics in the app.

## Plugins installed
Dataview · Kanban · Spaced Repetition · Obsidian Git (auto pull on open, auto commit every 30 min) · Excalidraw ·
New 3D Graph. CSS snippet `learning-galaxy-glass` gives Obsidian the app's glass look.
First open: Obsidian asks to **trust the vault author** → choose *Trust* so the plugins load.

## Phone
Install Obsidian mobile, clone the private repo with the Obsidian Git plugin (needs a GitHub token), or just use the
Learning Galaxy website — it is the live copy.
