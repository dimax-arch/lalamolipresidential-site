// ═══════════════════════════════════════════════════════
//  spotify-refresh/index.ts — Supabase Edge Function (Deno)
//
//  Refresca el access token de Spotify a partir del refresh
//  token del usuario, usando el flujo confidencial
//  (Client ID + Client Secret). El secret nunca llega al
//  navegador: vive solo aquí.
//
//  El gateway de Supabase verifica el JWT por defecto, así
//  que solo usuarios autenticados pueden invocarla.
//
//  Secrets requeridos (Supabase → Edge Functions → Secrets):
//    SPOTIFY_CLIENT_ID
//    SPOTIFY_CLIENT_SECRET
// ═══════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID');
  const clientSecret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    console.error('SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET no configurados');
    return json({ error: 'Spotify no configurado en el servidor' }, 500);
  }

  let refreshToken: string | undefined;
  try {
    const body = await req.json();
    refreshToken = body?.refresh_token;
  } catch {
    return json({ error: 'JSON inválido' }, 400);
  }
  if (!refreshToken) {
    return json({ error: 'Falta refresh_token' }, 400);
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[spotify-refresh] Spotify respondió', res.status, detail);
    return json({ error: 'No se pudo refrescar el token de Spotify' }, 502);
  }

  const data = await res.json();
  return json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    // Spotify puede rotar el refresh token; si no, el cliente conserva el anterior.
    refresh_token: data.refresh_token ?? null,
  });
});
