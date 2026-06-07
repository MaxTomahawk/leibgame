# What to tell a new agent

Everything else (Supabase, repo layout, rules, acceptance criteria) is in the repo:

- [`docs/CONTEXT.md`](CONTEXT.md) — **agents read this first**
- [`AGENTS.md`](../AGENTS.md) — Cloud VM / run / test
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — human setup
- [`docs/ROADMAP.md`](ROADMAP.md) — status checklist

**You do not paste long prompts.** Say one of these:

---

### Step 1 — Multi-game platform

> Read `docs/CONTEXT.md` and `AGENTS.md`. Build the multi-game platform (hub + move Leib Clouds to `games/clouds/`). Leib Jump comes later. Open a draft PR.

Run this **first**. Wait until it merges or is clearly working.

---

### Step 2 — Leib Jump

> Read `docs/CONTEXT.md` and `AGENTS.md`. Add Leib Jump as the second game on the platform. Do not break Leib Clouds. Open a draft PR.

Run this **after** step 1.

---

### Optional one-liners

| You want… | Say… |
|-----------|------|
| Fix multiplayer | Read `docs/CONTEXT.md`. Fix [describe bug]. Test on dev Supabase. PR. |
| New asset in manifest | Read `docs/CONTEXT.md`. Add [asset] to leibgame-assets manifest; wire in leibgame. PR both repos. |
| Compare approaches | Read `docs/CONTEXT.md`. Propose options for [X]. Do not implement until I pick. |

---

**Why two steps?** Platform refactor + new game in one agent run broke twice before. Split keeps Clouds working.
