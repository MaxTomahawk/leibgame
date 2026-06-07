# What to tell a new agent

Repo holds the full context. Agents **must** update docs on their branch before PR ([`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md)).

**Latest handoff:** [`HANDOFF.md`](HANDOFF.md) — often has the exact prompt to run next.

---

## Step 1 — Multi-game platform (use this now)

Copy **everything** in the block below to a new Cloud agent:

```
Read docs/CONTEXT.md, docs/MAINTAINING_DOCS.md, docs/HANDOFF.md, and AGENTS.md.
Fetch and branch from latest main: cursor/multigame-platform-1a65.

Build the multi-game platform: hub at /, move Leib Clouds to games/clouds/, shared/ for supabase + services + asset-registry, platform/ for hub UI. Supabase multiplayer + shop + shared rooms must still work. Do NOT implement Leib Jump.

Before your draft PR, complete the checklist in docs/MAINTAINING_DOCS.md:
- Update docs/CONTEXT.md "Current code (main)"
- Update docs/ROADMAP.md checkboxes
- Rewrite docs/HANDOFF.md with the full Leib Jump prompt for the next agent (use the template in MAINTAINING_DOCS.md)
- Paste that Jump prompt into your PR description under "Next agent prompt"

Run: python3 -m http.server 8000 and npx playwright test tests/example.spec.js tests/model_load.spec.js
Open draft PR to main.
```

After that agent merges, the **Jump prompt will live in `docs/HANDOFF.md`** on `main` — you may only need to say “run the prompt in HANDOFF.md” for step 2.

---

## Step 2 — Leib Jump

After step 1 is merged, either:

- Copy the **“Next agent prompt”** from [`HANDOFF.md`](HANDOFF.md) on `main`, or say:

> Read docs/CONTEXT.md, docs/MAINTAINING_DOCS.md, docs/HANDOFF.md, and AGENTS.md. Do what HANDOFF.md says. Branch cursor/leib-jump-game-1a65 from main.

---

## Optional one-liners

| You want… | Say… |
|-----------|------|
| Fix a bug | Read docs/HANDOFF.md and docs/CONTEXT.md. Fix [X]. Follow MAINTAINING_DOCS.md before PR. |
| New asset | Read docs/CONTEXT.md. Add [asset] to leibgame-assets manifest; wire in leibgame. Update HANDOFF.md. PR both repos. |

---

## For humans: will context stay updated?

**Yes, if agents follow the contract.** Every PR should update `CONTEXT.md`, `ROADMAP.md`, and `HANDOFF.md` on the branch; merging updates `main` for the next agent. See [`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md). Wiki is optional; repo docs are canonical.
