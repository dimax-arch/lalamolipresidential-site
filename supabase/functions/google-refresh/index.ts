// ═══════════════════════════════════════════════════════
//  google-refresh/index.ts — Supabase Edge Function (Deno)
//
//  Refresca el access token de Google a partir del refresh
//  token del usuario. El client secret nunca llega al
//  navegador: vive solo aquí. Debe ser el MISMO OAuth client
//  configurado en el provider de Google de Supabase Auth.
//
//  El gateway de Supabase verifica el JWT por defecto, así
//  que solo usuarios autenticados pueden invocarla.
//
//  Secrets requeridos (Supabase → Edge Functions → Secrets):
//    GOOGLE_CLIENT_ID
//    GOOGLE_CLIENT_SECRET
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

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    console.error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados');
    return json({ error: 'Google no configurado en el servidor' }, 500);
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

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.error('[google-refresh] Google respondió', res.status, detail);
    return json({ error: 'No se pudo refrescar el token de Google' }, 502);
  }

  const data = await res.json();
  return json({
    access_token: data.access_token,
    expires_in: data.expires_in,
    // Google normalmente no rota el refresh token; el cliente conserva el suyo.
    refresh_token: data.refresh_token ?? null,
  });
});
