# Launching Claude Code on Modern Tools

Short guide for firing up a working session on this repo.

## 1. Open PowerShell in the project folder

cd "C:\XSFA\Modern Tools Official"
claude remote-control



There should be exactly **one** copy of this project on disk at that path. If you see another copy anywhere else, stop and check with Henry before doing anything — a duplicate is what caused the 2026-07-06 prod incident.

## 2. Start Claude Code

```powershell
claude --dangerously-skip-permissions
```

That drops you into an interactive session in this folder. Claude Code auto-loads `CLAUDE.md` (project instructions) and your global `~/.claude/CLAUDE.md` on startup.

## 3. First prompt of every session

Ask Claude to catch up before touching anything:

> Read `docs/SESSIONS.md` (top entry) and `CLAUDE.md`, then tell me what's live, what's pending, and what's next.

The top entry of `docs/SESSIONS.md` is the source of truth for "where did we leave off." `CLAUDE.md` explains the standing rules (deploy safety, verify-before-done, session log workflow).

## 4. Useful slash commands

Skills you'll actually reach for during a session:

| Command | What it does |
|---|---|
| `/loop 5m /foo` | Runs a prompt or slash command on a recurring interval. Omit the interval to let the model self-pace. |
| `/schedule` | Create/list/manage scheduled remote agents (cron for Claude Code). |
| `/watch <url\|path>` | Downloads a video, transcribes it (captions or Whisper), answers questions about the frames. |
| `/security-review` | Full security review of the pending changes on the current branch. |
| `/review` | Reviews a specific pull request. |
| `/ultrareview` | Launches a multi-agent cloud review of the current branch (or `/ultrareview <PR#>` for a GitHub PR). Billed. User-triggered only. |
| `/fast` | Toggle Fast mode — Claude Opus with faster output. |
| `/help` | Full slash-command reference. |

Type `/` in the prompt to see the full list — new skills get auto-discovered from installed plugins.

## 5. When you're done

End the session with a new entry at the top of `docs/SESSIONS.md`:

```
## YYYY-MM-DD — one-line title

**Worked on:** …
**Changed:** files touched + one-line summary of each
**Deploy status:** live? deploy id? alias verified? rollback URL for the previous good build?
**In progress / broken / unknowns:** …
**Next:** …
```

No exceptions on the log entry — even trivial sessions get one. That's how the next session knows what happened.

## Deploy quick-reference (don't skip)

Production deploys go out via `vercel --prod` from this folder, **never** via `git push`. Full pre-flight + rollback sequence is in `CLAUDE.md` under "Deploy safety". The one command you always run before deploying:

```powershell
npx vercel inspect modern-tools-rho.vercel.app --scope henry-as-projects-88caed67
```

That gives you the currently-live deploy id — capture it as your rollback target before shipping anything new.
