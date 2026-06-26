# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A private, two-person web app themed as a "Palacio Presidencial". There are exactly two
users — a **presidente** and a **ministro** — who share an agenda, a chat channel, a
document list, and a Spotify "now playing" panel. It's a Vite + React SPA backed entirely
by Supabase (Auth, Postgres + RLS, Realtime, Edge Functions). Installable as a PWA. The UI
and most code comments are in **Spanish**; keep new user-facing strings and comments in
Spanish to match.

## Commands

```bash
npm run dev      # Vite dev server at http://localhost:5173
npm run build    # production build → dist/
npm run preview  # serve the production build locally
npm test         # node --test tests/*.test.mjs
```

Run a single test file: `node --test tests/role-map.test.mjs`. The test suite is minimal
(currently only role mapping); there is no linter configured.

Local setup requires a `.env` (copy `.env.example`) with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Without them the app boots into a config-error state. The full
backend bring-up (SQL files run in order, users, Edge Functions, webhooks) is documented
step-by-step in **SUPABASE.md** — read it before touching anything backend-related.

## Architecture

### Roles are the spine of everything
A Supabase Auth user carries a `role` of `president` or `minister` (in metadata). That role
maps to a `userKey` of `'presidente'` / `'ministro'` (`ROLE_TO_USER_KEY` in
`src/lib/constants.js`), which is the identity used throughout the app and DB. Two
non-obvious rules:
- `app_metadata.role` takes priority over `user_metadata.role` — `app_metadata` is
  server-controlled and survives the Spotify OAuth login path (see `userKeyFromAuthUser`).
- A valid session **without** a recognized role is rejected and signed out. The entire app
  gates on `userKey` (`App.jsx`: `Login` vs `Dashboard`).

### Data lives in Supabase, not the client
There is no localStorage for app data (the only exception is Spotify tokens in
`src/lib/spotify.js`). Each domain is one hook following the same pattern: initial fetch →
Realtime `postgres_changes` subscription → **debounced (120ms) refetch** on change, plus
optimistic local-state updates on writes.
- `usePalacioData` — decretos (the agenda), mensajes (chat), decreto_logs (history). The core.
- `useDocumentos` — shared link list.
- `useSpotify` — `now_playing` table sync + polling Spotify while the tab is open.
- `usePush` — service-worker registration + push subscription.

`src/lib/mappers.js` converts DB rows (snake_case) ↔ UI objects (camelCase). When you add a
column, update the mapper, not just the query.

### "Decreto" is the central entity
A decreto is an agenda item / proposal with a `type`, `priority`, and `status`
(`pending`→`approved`/`rejected`). A single user action fans out to three tables: the
write to `decretos`, an audit entry in `decreto_logs`, and a line in the `mensajes` chat
(see `submitItem`/`approveItem`/etc. in `usePalacioData.js`). Deleting a decreto writes its
log with `decreto_id = null` to avoid the FK violation.

### Security is enforced in Postgres RLS, not just the client
The client pre-checks rules (e.g. "no puede aprobar sus propios decretos"), but the source
of truth is RLS in `supabase/sync-tables.sql` + `migrate-security.sql`. The
`public.auth_user_key()` SQL function mirrors the JWT-role→userKey mapping, and policies use
it to block self-approval and `user_key`/`author_id` impersonation. If you change role logic
in JS, change `auth_user_key()` to match.

### Edge Functions (Deno, in `supabase/functions/`)
- `send-push` — fired by **Database Webhooks** on INSERT into `decretos`/`mensajes`. Sends a
  Web Push (via `jsr:@negrel/webpush`) **and** a Resend email to the *other* user. Authed by
  a shared `WEBHOOK_SECRET` (Bearer or `x-webhook-secret`). Push failures and missing email
  config degrade gracefully (one channel failing doesn't block the other).
- `spotify-refresh` — refreshes Spotify provider tokens; holds the Spotify client secret so
  the browser never sees it.

These run server-side and are **not** exercised by `npm run dev`; deploy with
`supabase functions deploy <name>`.

### Spotify has two token sources
Tracked by `sp_token_source` in localStorage:
- `'pkce'` — the "Connect Spotify" panel button (Authorization Code + PKCE, no secret,
  callback at `spotify-callback.html`).
- `'provider'` — "Entrar con Spotify" (Supabase OAuth login). Its token refresh routes
  through the `spotify-refresh` Edge Function because it needs the client secret.

`forceRefresh()` branches on the source. Optional feature: gated by `VITE_SPOTIFY_CLIENT_ID`.

### Push notifications
The VAPID **public** key is hardcoded in `src/lib/constants.js` and must match the
`VAPID_PRIVATE_KEY` secret in Supabase. Service worker is `public/service-worker.js`. Push
is gated by `isVapidConfigured()` / browser support.

### Multi-page build
`vite.config.js` defines three HTML entry points with `base: './'` (relative asset paths so
it works on subpath hosting): `index.html` (main app → `src/main.jsx`),
`reset-password.html` (→ `src/reset.jsx`), `spotify-callback.html` (→ `src/spotify-callback.jsx`).

### Providers & components
`main.jsx` wraps the app in `ToastProvider` → `AuthProvider` → `ConfirmProvider`. Components
are colocated with CSS Modules (`Component/Component.jsx` + `Component.module.css`).
`Dashboard.jsx` composes the two-column layout from the panel components.

## Deployment

Production deploys via **Netlify** (`netlify.toml`: `npm run build` → `dist/`, Node 20).
Supabase env vars are set in the Netlify dashboard. (SUPABASE.md still describes a GitHub
Pages workflow, but Netlify is the live path.)
