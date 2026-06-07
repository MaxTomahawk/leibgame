# Supabase setup (multiplayer + cloud progression)

Leibgame uses **Supabase** for:

- **Player progression** — coins, stars, shop upgrades (`player_profiles`)
- **Shared rooms** — same world layout + collected coins (`rooms`)
- **Live presence** — other players in your room (`room_players` + Realtime)

When `config.js` has no keys, the game runs **offline** (localStorage only).

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and create a project.
2. **Authentication → Providers → Anonymous sign-ins** → **Enable**.
3. (Optional) Enable **Email** provider for account linking / login.

## 2. Run the database schema

1. Open **SQL Editor** in the Supabase dashboard.
2. Paste and run the full contents of [`supabase/schema.sql`](supabase/schema.sql).

## 3. Enable Realtime

1. **Database → Publications → `supabase_realtime`**
2. Add tables: `rooms`, `room_players`

## 4. Configure the game client

```bash
cp config.example.js config.js
```

Fill in from **Project Settings → API**:

- `SUPABASE_URL` — Project URL  
- `SUPABASE_ANON_KEY` — `anon` `public` key  

Serve the game and open `http://localhost:8000`. Status should show **Online!**

## Rooms

| URL | Room |
|-----|------|
| `/` | `main_world` (public default) |
| `/?room=friday` | Custom shared room |

Everyone in the same room shares world layout and which coins are collected. Each player keeps their own coins/stars/upgrades on their profile.

## Deploy notes (GitHub Pages)

Add the same `config.js` values before deploy, or inject them in CI. The `anon` key is safe in the browser when **RLS** is enabled (included in `schema.sql`).

## What was removed

- Firebase / Firestore (`firebase.js` deleted)
- High-frequency position writes to a document DB (replaced by `room_players` upserts + Realtime)
