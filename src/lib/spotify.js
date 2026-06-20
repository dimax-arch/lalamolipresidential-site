// ═══════════════════════════════════════════════════════
//  spotify.js — OAuth PKCE + lectura de "Ahora Suena"
//
//  Flujo Authorization Code + PKCE, 100% en el cliente
//  (sin client_secret). Los tokens viven en localStorage.
//  Solo se pide el scope de lectura de reproducción actual.
// ═══════════════════════════════════════════════════════

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const CURRENTLY_PLAYING_URL = 'https://api.spotify.com/v1/me/player/currently-playing';
const SCOPE = 'user-read-currently-playing';

// localStorage (persisten entre sesiones)
const LS_ACCESS = 'sp_access_token';
const LS_REFRESH = 'sp_refresh_token';
const LS_EXPIRES = 'sp_expires_at';

// sessionStorage (solo durante el handshake de OAuth)
const SS_VERIFIER = 'sp_code_verifier';
const SS_STATE = 'sp_auth_state';

function getClientId() {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
}

export function isSpotifyConfigured() {
  return Boolean(getClientId());
}

export function getRedirectUri() {
  return `${window.location.origin}/spotify-callback.html`;
}

// ── PKCE helpers ───────────────────────────────────────
function randomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (let i = 0; i < length; i++) out += chars[values[i] % chars.length];
  return out;
}

function base64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challengeFromVerifier(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64url(digest);
}

// ── Almacenamiento de tokens ───────────────────────────
function storeTokens(data) {
  if (data.access_token) localStorage.setItem(LS_ACCESS, data.access_token);
  if (data.refresh_token) localStorage.setItem(LS_REFRESH, data.refresh_token);
  if (data.expires_in) {
    localStorage.setItem(LS_EXPIRES, String(Date.now() + data.expires_in * 1000));
  }
}

export function hasTokens() {
  return Boolean(localStorage.getItem(LS_REFRESH));
}

export function disconnect() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_EXPIRES);
}

// ── Inicio del flujo OAuth ─────────────────────────────
export async function beginAuth() {
  const clientId = getClientId();
  if (!clientId) throw new Error('Falta VITE_SPOTIFY_CLIENT_ID');

  const verifier = randomString(64);
  const challenge = await challengeFromVerifier(verifier);
  const state = randomString(16);
  sessionStorage.setItem(SS_VERIFIER, verifier);
  sessionStorage.setItem(SS_STATE, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: getRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

// ── Callback: intercambio de código por tokens ─────────
export async function exchangeCode(code, state) {
  const verifier = sessionStorage.getItem(SS_VERIFIER);
  const expectedState = sessionStorage.getItem(SS_STATE);
  if (!verifier) throw new Error('Falta el code_verifier (la sesión de autorización expiró)');
  if (expectedState && state && expectedState !== state) {
    throw new Error('State inválido (posible CSRF)');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    client_id: getClientId(),
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`No se pudo intercambiar el código de Spotify (${res.status}) ${detail}`);
  }
  const data = await res.json();
  storeTokens(data);
  sessionStorage.removeItem(SS_VERIFIER);
  sessionStorage.removeItem(SS_STATE);
}

// ── Refresco del access token (rota el refresh token en PKCE) ──
async function refreshAccessToken() {
  const refresh = localStorage.getItem(LS_REFRESH);
  if (!refresh) throw new Error('No hay refresh token de Spotify');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: getClientId(),
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    // El refresh token ya no sirve: forzamos reconexión.
    disconnect();
    throw new Error('La sesión de Spotify expiró; vuelve a conectar.');
  }
  const data = await res.json();
  storeTokens(data);
  return data.access_token;
}

async function getValidAccessToken() {
  const access = localStorage.getItem(LS_ACCESS);
  const expiresAt = Number(localStorage.getItem(LS_EXPIRES) || 0);
  // 30s de margen para evitar usar un token a punto de expirar.
  if (access && Date.now() < expiresAt - 30000) return access;
  return refreshAccessToken();
}

// ── Normalización de la respuesta de Spotify ───────────
function normalize(json) {
  if (!json || !json.item) return { isPlaying: false };
  const item = json.item;
  const albumArtUrl = item.album?.images?.[0]?.url || item.images?.[0]?.url || null;
  const artistName = Array.isArray(item.artists)
    ? item.artists.map((a) => a.name).join(', ')
    : item.show?.name || null;
  return {
    isPlaying: Boolean(json.is_playing),
    trackName: item.name || null,
    artistName: artistName || null,
    albumName: item.album?.name || item.show?.name || null,
    albumArtUrl,
    trackUrl: item.external_urls?.spotify || null,
    durationMs: item.duration_ms ?? null,
    progressMs: json.progress_ms ?? null,
  };
}

// ── Lectura de la reproducción actual ──────────────────
export async function getCurrentlyPlaying() {
  let token = await getValidAccessToken();
  let res = await fetch(CURRENTLY_PLAYING_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 401: token rechazado → refrescar una vez y reintentar.
  if (res.status === 401) {
    token = await refreshAccessToken();
    res = await fetch(CURRENTLY_PLAYING_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (res.status === 204) return { isPlaying: false }; // nada sonando
  if (!res.ok) throw new Error(`Spotify respondió ${res.status}`);
  return normalize(await res.json());
}
