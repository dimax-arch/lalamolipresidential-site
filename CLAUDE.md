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
There is no localStorage for app data (the only exceptions are Spotify tokens in
`src/lib/spotify.js` and Google tokens in `src/lib/google.js`). Each domain is one hook
following the same pattern: initial fetch → Realtime `postgres_changes` subscription →
**debounced (120ms) refetch** on change, plus optimistic local-state updates on writes.
- `usePalacioData` — decretos (the agenda), mensajes (chat), decreto_logs (history). The core.
- `useDocumentos` — shared link list.
- `useSpotify` — `now_playing` table sync + polling Spotify while the tab is open.
- `usePush` — service-worker registration + push subscription.
- `useGoogleCalendar` — read-only Google Calendar events for the visible month (no
  Realtime; plain fetch against the Google API, per-device tokens).
- `useGenshin` — both users' Genshin Impact data via the `genshin-notes` Edge Function
  (no Realtime; re-invokes every 5 min, server caches in `genshin_cache`).

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
- `google-refresh` — same pattern for Google tokens (must use the same OAuth client as the
  Google provider in Supabase Auth).
- `genshin-notes` — Genshin card backend: fetches HoYoLAB Real-Time Notes + Traveler's
  Diary (both need the session cookies, stored as `HOYO_*` secrets — they expire every
  few weeks, see SUPABASE.md §8) and the Enka.Network profile with character showcase
  for both accounts, caching results in the `genshin_cache` table (RLS deny-all; only
  service role). Builds the `DS` header itself (MD5; salt overridable via
  `HOYO_DS_SALT`). Showcase avatar ids are resolved to icons via Enka's
  `characters.json` store (cached 24h, no names on purpose — the client links to
  enka.network for detail). Typed errors (`cookie_expired`, `data_not_public`,
  `not_configured`) map to distinct UI states in `GenshinPanel`.

These run server-side and are **not** exercised by `npm run dev`; deploy with
`supabase functions deploy <name>`.

### Spotify has two token sources
Tracked by `sp_token_source` in localStorage:
- `'pkce'` — the "Connect Spotify" panel button (Authorization Code + PKCE, no secret,
  callback at `spotify-callback.html`).
- `'provider'` — "Entrar con Spotify" (Supabase OAuth login). Its token refresh routes
  through the `spotify-refresh` Edge Function because it needs the client secret.

`forceRefresh()` branches on the source. Optional feature: gated by `VITE_SPOTIFY_CLIENT_ID`.

### Google login + Google Calendar (read-only, per device)
"Entrar con Google" is a Supabase OAuth login (`loginWithGoogle` in `AuthContext`) that also
requests `calendar.readonly` with `access_type=offline` + `prompt=consent`, so logging in
with Google seeds calendar tokens into localStorage (`src/lib/google.js`). Because Supabase
only says *that* a provider token arrived — not *whose* — `AuthContext` stamps the provider
in sessionStorage (`oauth_provider`) before every OAuth redirect and routes the token to the
right store on `SIGNED_IN`. The Calendar panel merges each user's own Google events into the
grid via `useGoogleCalendar`; nothing is written to Google or shared between users. Setup
(Google Cloud + Supabase provider + `google-refresh` secrets) is in SUPABASE.md §7. The
Google account email must match the cabinet account email, and the role must live in
`app_metadata` to survive the OAuth path.

### Push notifications
The VAPID **public** key is hardcoded in `src/lib/constants.js` and must match the
`VAPID_PRIVATE_KEY` secret in Supabase. Service worker is `public/service-worker.js`. Push
is gated by `isVapidConfigured()` / browser support.

### Multi-page build
`vite.config.js` defines three HTML entry points with `base: './'` (relative asset paths so
it works on subpath hosting): `index.html` (main app → `src/main.jsx`),
`reset-password.html` (→ `src/reset.jsx`), `spotify-callback.html` (→ `src/spotify-callback.jsx`).

### Providers & components
`main.jsx` wraps the app in `ThemeProvider` → `ToastProvider` → `AuthProvider` →
`ConfirmProvider`. Components are colocated with CSS Modules (`Component/Component.jsx` +
`Component.module.css`). `Dashboard.jsx` composes the layout: a top grid (decreto form /
chat / rail with Spotify + files) followed by full-width Genshin, Calendar and Agenda
panels, all in a single scroll container. One exception to the colocation convention: `Toast/` has only
`Toast.module.css` — the toast UI itself is rendered inside `ToastContext.jsx`, so there is
no `Toast.jsx`.

### Theming (two themes, CSS custom properties)
The visual design comes from the "Turno 1" redesign: **dark** (`1b — Sala de Situación`,
default) and **light** (`1a — Despacho Claro`). All colors live as CSS custom properties in
`src/index.css` — `:root` holds the dark palette and `:root[data-theme='light']` overrides
it; component CSS must use tokens (`--surface`, `--accent`, `--status-*`, etc.), never raw
hex values. `src/lib/theme.js` + `ThemeContext` manage the `data-theme` attribute, the
`palacio_theme` localStorage key (a device preference — the one other localStorage exception
besides Spotify tokens) and the `theme-color` meta. Each HTML entry point has an inline
pre-paint script that applies the stored theme to avoid a flash. The toggle button
(`ThemeToggle`) lives in the Header and the Login screen. One layout gotcha: panels use
`overflow: hidden`, so any flex/grid scroll parent needs `flex-shrink: 0` on them or they
collapse (see `.shell > *` in `Dashboard.module.css`).

## Deployment

Production deploys via **Netlify** (`netlify.toml`: `npm run build` → `dist/`, Node 20).
Supabase env vars are set in the Netlify dashboard. The live domain is
**`lalamoliypipe.com`** — it's the redirect URL that Spotify OAuth and Supabase Auth are
configured against (see `.env.example`), so changing it means updating those provider
settings too. (SUPABASE.md still describes a GitHub Pages workflow, but Netlify is the live
path.)

## Line endings

Files are committed as **LF**, enforced by `.gitattributes` (`* text=auto eol=lf`). If your
working tree shows every file modified with equal insertions/deletions in `git diff --stat`,
that's CRLF churn from a Windows/WSL editor, not real changes — run
`git add --renormalize .` to clear it. Don't reformat line endings as part of a change; keep
diffs scoped to the lines you actually touched.
