# Maintaining agent context (mandatory)

**Repo docs are the single source of truth.** Not chat history, not a wiki, not the PR description alone.

Future agents read **`main`** (or merge `main` into their branch before coding). Your job is to leave **`main` more accurate** when you merge.

Optional human wiki ([GitHub Wiki](https://github.com/MaxTomahawk/leibgame/wiki)) is for long guides only. **Agents never rely on the wiki.** If you add wiki pages, link from `DEVELOPMENT.md` and still update repo files below.

---

## Files agents must know

| File | Updated when |
|------|----------------|
| [`CONTEXT.md`](CONTEXT.md) | Architecture, “current code”, rules, or task specs change |
| [`ROADMAP.md`](ROADMAP.md) | A roadmap item is done or scope changes |
| [`HANDOFF.md`](HANDOFF.md) | **Every task** — next agent prompt + branch status |
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Human setup, run commands, or troubleshooting change |
| [`AGENTS.md`](../AGENTS.md) | Cloud VM, test commands, or repo layout for agents change |
| [`AGENT_PROMPTS.md`](AGENT_PROMPTS.md) | Default one-liners for the **human** change |
| [`.cursor/rules/leibgame.mdc`](../.cursor/rules/leibgame.mdc) | Always-on Cursor rules change |

Code-adjacent docs: `SUPABASE.md`, `README.md` — update if your change affects them.

---

## At task start (every agent)

1. `git fetch origin && git checkout main && git pull origin main`
2. `git checkout -b cursor/<name>-1a65`
3. Read in order: **`CONTEXT.md`** → **`MAINTAINING_DOCS.md`** (this file) → **`HANDOFF.md`** → **`AGENTS.md`**
4. If `HANDOFF.md` describes work in progress on another branch, coordinate with the human before overlapping.

---

## Before every PR (non-negotiable)

Checklist — **all** apply:

- [ ] **`docs/CONTEXT.md`** — section **“Current code (main)”** reflects reality *after your PR* (paths, entry URLs, what’s online/offline).
- [ ] **`docs/ROADMAP.md`** — check off completed items; add new items if you expanded scope.
- [ ] **`docs/HANDOFF.md`** — filled in using the template below (next agent prompt, your branch name, what you finished).
- [ ] **Tests** — `npx playwright test tests/example.spec.js tests/model_load.spec.js tests/clouds_start.spec.js` (fix or extend tests if UI changed).
- [ ] **Browser verification** — hub → Clouds → play → hub → Clouds again in a real browser (Cursor Cloud desktop or local). Confirm Start Game works after character selection; no 404s on bare `*.glb` without quality suffix.
- [ ] **PR body** — includes the **“Next agent prompt”** block copied from `HANDOFF.md` (so the human can spawn the next agent without searching).

If you changed how to run, test, or configure: update **`AGENTS.md`** and/or **`DEVELOPMENT.md`**.

If you only fixed a small bug and nothing structural changed: still update **`HANDOFF.md`** (status + “no follow-up” or next fix).

---

## `HANDOFF.md` template (copy into that file)

Replace the entire handoff file content with:

```markdown
# Handoff to next agent

| Field | Value |
|-------|--------|
| **Last agent task** | (e.g. Multi-game platform) |
| **Branch** | `cursor/...-1a65` |
| **PR** | #___ or link |
| **Updated** | YYYY-MM-DD |
| **Status** | ready for merge / blocked on ___ |

## What was done

- Bullet list of what works now
- How to test (one command block)

## Current code snapshot

(Short tree or paths — must match CONTEXT.md after merge)

## Next agent prompt (copy verbatim to new agent)

> (Single block the human pastes into Cursor — must tell agent to read CONTEXT, MAINTAINING_DOCS, HANDOFF, AGENTS, and to update docs before PR)

## Docs updated in this branch

- [ ] CONTEXT.md
- [ ] ROADMAP.md
- [ ] HANDOFF.md (this file)
- [ ] DEVELOPMENT.md / AGENTS.md (if needed)
```

---

## After merge to `main`

The human merges your PR → **`main` carries your doc updates** → next agent reads updated context. **No separate “sync wiki” step required** if you followed this checklist.

If context was wrong after merge: fix forward on a small `cursor/docs-fix-1a65` branch — never leave `CONTEXT.md` lying.

---

## What NOT to do

- Do **not** put one-off instructions only in PR comments or chat.
- Do **not** create `docs/NOTES_2026.md` — update the canonical files above.
- Do **not** skip `HANDOFF.md` because “the human knows.”
- Do **not** resurrect deleted branches listed in `CONTEXT.md`.
