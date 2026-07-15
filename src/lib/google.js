// ═══════════════════════════════════════════════════════
//  google.js — tokens de Google + lectura de Google Calendar
//
//  Los tokens llegan del login "Entrar con Google" (OAuth de
//  Supabase con scope calendar.readonly y access_type=offline).
//  El refresco pasa por la Edge Function google-refresh, que
//  guarda el client secret (nunca llega al navegador).
//  Los tokens viven en localStorage, como los de Spotify.
// ═══════════════════════════════════════════════════════

import { getSupabaseClient } from './supabase';

const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

// localStorage (persisten entre sesiones)
const LS_ACCESS = 'gg_access_token';
const LS_REFRESH = 'gg_refresh_token';
const LS_EXPIRES = 'gg_expires_at';

// ── Almacenamiento de tokens ───────────────────────────
export function hasTokens() {
  return Boolean(localStorage.getItem(LS_REFRESH) || localStorage.getItem(LS_ACCESS));
}

export function disconnect() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_EXPIRES);
}

// Tokens obtenidos vía el login de Supabase con Google (provider_token).
export function seedProviderTokens({ accessToken, refreshToken, expiresIn }) {
  if (!accessToken) return;
  localStorage.setItem(LS_ACCESS, accessToken);
  if (refreshToken) localStorage.setItem(LS_REFRESH, refreshToken);
  localStorage.setItem(LS_EXPIRES, String(Date.now() + (expiresIn || 3600) * 1000));
}

// ── Refresco del access token (Edge Function google-refresh) ──
async function forceRefresh() {
  const refresh = localStorage.getItem(LS_REFRESH);
  if (!refresh) {
    // Sin refresh token (Google no lo entregó): la sesión muere al expirar.
    disconnect();
    throw new Error('La conexión con Google expiró; vuelve a entrar con Google.');
  }
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { data, error } = await supabase.functions.invoke('google-refresh', {
    body: { refresh_token: refresh },
  });
  if (error || !data?.access_token) {
    disconnect();
    throw new Error('No se pudo refrescar el token de Google.');
  }
  localStorage.setItem(LS_ACCESS, data.access_token);
  if (data.refresh_token) localStorage.setItem(LS_REFRESH, data.refresh_token);
  localStorage.setItem(LS_EXPIRES, String(Date.now() + (data.expires_in || 3600) * 1000));
  return data.access_token;
}

async function getValidAccessToken() {
  const access = localStorage.getItem(LS_ACCESS);
  const expiresAt = Number(localStorage.getItem(LS_EXPIRES) || 0);
  // 30s de margen para evitar usar un token a punto de expirar.
  if (access && Date.now() < expiresAt - 30000) return access;
  return forceRefresh();
}

// ── Normalización de eventos ───────────────────────────
function pad2(n) {
  return String(n).padStart(2, '0');
}

function localDateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Convierte un evento de la API en entradas por día con la forma
// { id, date: 'YYYY-MM-DD', time: 'HH:MM' | null, title, link }.
// Los eventos de día completo multi-día se expanden a un chip por día
// (end.date es exclusivo en la API de Google).
function expandEvent(ev) {
  const title = ev.summary || '(Sin título)';
  const link = ev.htmlLink || null;

  if (ev.start?.dateTime) {
    const start = new Date(ev.start.dateTime);
    return [
      {
        id: ev.id,
        date: localDateKey(start),
        time: `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
        title,
        link,
      },
    ];
  }

  if (!ev.start?.date) return [];
  const out = [];
  const cursor = new Date(`${ev.start.date}T00:00:00`);
  const end = new Date(`${(ev.end?.date || ev.start.date)}T00:00:00`);
  // Tope defensivo por si llega un evento absurdamente largo.
  for (let i = 0; i < 62; i++) {
    out.push({
      id: `${ev.id}_${localDateKey(cursor)}`,
      date: localDateKey(cursor),
      time: null,
      title,
      link,
    });
    cursor.setDate(cursor.getDate() + 1);
    if (cursor >= end) break;
  }
  return out;
}

// ── Lectura de eventos del calendario principal ────────
export async function listEvents(timeMin, timeMax) {
  const params = new URLSearchParams({
    singleEvents: 'true', // expande recurrencias en instancias individuales
    orderBy: 'startTime',
    maxResults: '250',
    timeMin,
    timeMax,
  });

  let token = await getValidAccessToken();
  let res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 401: token rechazado → refrescar una vez y reintentar.
  if (res.status === 401) {
    token = await forceRefresh();
    res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}`);
  const json = await res.json();
  return (json.items || [])
    .filter((ev) => ev.status !== 'cancelled')
    .flatMap(expandEvent);
}
