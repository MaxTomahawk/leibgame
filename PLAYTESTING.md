# Playtesting agent branches & candidates

## Good news: both agent branches are already on GitHub

| Branch | What it built |
|--------|----------------|
| `cursor/multi-game-platform-0969` | `games/` + `shared/` + `platform/` layout |
| `cursor/multigame-leib-platform-36ec` | `games.js`, `leib-jump.js` 2D game alongside clouds |

They are **not** stuck in Cursor only — fetch and checkout like any branch.

---

## Easiest ways to try them in a browser

### A. On your laptop (simplest)

```bash
git clone https://github.com/MaxTomahawk/leibgame.git
cd leibgame
git checkout cursor/multi-game-platform-0969   # or the other branch
python3 -m http.server 8000
```

Open `http://localhost:8000`.

Share with your phone (same WiFi): `http://<your-pc-ip>:8000`  
Or tunnel: `cloudflared tunnel --url http://localhost:8000`

### B. Cursor Cloud dev environment

1. Open a Cloud Agent (or this workspace).
2. `git fetch && git checkout <branch>`.
3. `python3 -m http.server 8000 --bind 0.0.0.0`
4. Use Cursor’s port preview / tunnel if available.

### C. Public URL per candidate (GitHub Pages)

One Pages site = one branch at a time. Options:

- **Temporary:** point Pages to branch `cursor/multi-game-platform-0969`, test, switch to the other branch.
- **Nicer:** GitHub Action that deploys `main` to `/` and branch builds to `/preview/platform-a/` (more setup).

For picking a winner, **local + tunnel** is usually enough.

---

## Supabase while testing old branches

Those agent branches still use **Firebase**, not Supabase. For fair comparison:

1. Test **gameplay/UI** on the agent branch as-is (offline or Firebase if still configured).
2. Merge winner into `main` / Supabase work in a **new integration branch**.
3. Use **Leibgame-dev** Supabase only on branches that include the Supabase PR (`cursor/supabase-multiplayer-1a65` or `main` after merge).

Do **not** point experiments at **prod** Supabase until you mean to ship.

---

## Suggested git workflow (one winner)

```
main                          ← production game + Supabase prod
cursor/supabase-multiplayer   ← online stack (merge first or in parallel)
cursor/candidate-platform-a   ← rename from multi-game-platform-0969
cursor/candidate-jump-b       ← rename from multigame-leib-platform-36ec
cursor/integrate-winner       ← after you pick one
```

---

## Copy-paste prompts for each agent chat

Use **one chat per candidate** so they only push their own branch.

### Prompt — candidate A (platform layout)

```
You worked on the multi-game Leib platform (games/ + shared/ + platform/).

1. Make sure ALL your work is committed on branch cursor/candidate-platform-a
   (create it from your current work if needed; use prefix cursor/ and suffix -1a65).
2. git push -u origin cursor/candidate-platform-a
3. Reply with: branch name, how to run locally (one command), and what’s playable vs stub.

Do not merge to main. Do not delete the other candidate branch.
```

### Prompt — candidate B (Leib Jump)

```
You worked on Leib Jump + games.js multi-game launcher.

1. Make sure ALL your work is committed on branch cursor/candidate-jump-b
   (create from your current work; use prefix cursor/ and suffix -1a65).
2. git push -u origin cursor/candidate-jump-b
3. Reply with: branch name, how to run locally, and how Leib Clouds vs Leib Jump are started.

Do not merge to main. Do not delete the other candidate branch.
```

### Prompt — integration agent (after you pick)

```
Read PLAYTESTING.md and SUPABASE.md.

I chose branch cursor/candidate-XXXX as the multi-game base.

1. Branch cursor/integrate-winner-1a65 from latest main (with Supabase).
2. Port the chosen candidate into the current repo structure (asset-config, supabase, no Firebase).
3. Keep original Leib Clouds working; add the second game from the candidate.
4. Use Leibgame-dev only; document any schema changes as new supabase/migrations/* files.
5. Push and open a draft PR to main.
```

---

## You’re not “stupid” — this is just workflow

1. **Branches** = parallel experiments  
2. **localhost** = fastest test  
3. **tunnel** = phone / friend test  
4. **dev Supabase** = online saves without risking prod  
5. **merge one winner** when you’re happy  

No need to over-build hosting until one candidate wins.
