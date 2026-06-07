# Supabase setup

## Projects (already created)

| Environment | Supabase project | When the game uses it |
|-------------|------------------|------------------------|
| **Development** | `Leibgame-dev` | `localhost` / Cursor cloud dev |
| **Production** | `Leibgame` | GitHub Pages, public URL |

`config.js` picks dev vs prod automatically. Override with `?supabase=dev` or `?supabase=prod`.

Schema + Realtime are applied to **both** via migrations. **Player data is separate** — dev experiments do not touch prod saves.

### Safe database updates (do not break prod)

1. Change schema only by adding a **new** file under `supabase/migrations/` (never edit an old migration after prod uses it).
2. Apply to **Leibgame-dev** first (Supabase MCP or CLI).
3. Test the game against dev.
4. Apply the same migration to **Leibgame** (prod).
5. Optional: use `get_advisors` / dashboard linter before prod.

**Do not use Supabase “branches” on the free plan** — they cost ~**$0.013/hour** (~$10/month if left running). Two free **projects** is the right split.

---

## One-time dashboard steps (both projects)

1. **Authentication → Providers → Anonymous** → Enable (required for guest play).
2. **Authentication → URL configuration** — add your GitHub Pages URL when you deploy.
3. OAuth (when you want them): enable **Google**, **GitHub**, **Email** under Providers.  
   Phone/SMS needs a provider (e.g. Twilio); **SMS messages cost money**, not Supabase itself.

---

## Local run

```bash
python3 -m http.server 8000
# open http://localhost:8000  → uses Leibgame-dev
```

Status line should show **✅ Online!** after anonymous auth is enabled.

---

## Rooms

| URL | Room |
|-----|------|
| `/` | `main_world` |
| `/?room=friday` | Custom shared room |

---

## Free tier — how far can you go?

You are on Supabase **Free** (`MaxTomahawk's Org`). Rough limits:

| Resource | Free tier | Enough for Leibgame? |
|----------|-----------|---------------------|
| Projects | 2 active (you use both) | ✅ |
| Database | 500 MB | ✅ (your saves are tiny) |
| Bandwidth | 5 GB / month | ✅ early traffic |
| MAU (auth users) | 50,000 / month | ✅ |
| Realtime | Included | ✅ small rooms |
| Email auth | Included | ✅ |
| Google / GitHub OAuth | Included (counts toward MAU) | ✅ |
| Phone SMS | Needs Twilio/etc.; **you pay per SMS** | ⚠️ optional later |
| File storage | 1 GB | ✅ if you skip large uploads |

**Also free:** GitHub Pages (game), GitHub assets repo, Cursor dev VMs.

**You start paying when:**

- Supabase **Pro** (~$25/mo) — more DB, no pause, support, or you need >2 projects / heavy usage.
- **Supabase branch** hours (~$0.013/hr) — avoid on free; use second project instead.
- **SMS** for phone login — carrier/provider fees.
- **Traffic** beyond free egress at scale (many thousands of players).

For an indie browser game with OAuth + progression + multiplayer rooms, **free tier is realistic for a long time**.

---

## Tables

- `player_profiles` — coins, stars, upgrades  
- `rooms` — shared world + collected coins  
- `room_players` — live positions (Realtime)

Canonical SQL: [`supabase/schema.sql`](supabase/schema.sql)
