// ═══════════════════════════════════════════════════════
//  send-push/index.ts  —  Supabase Edge Function (Deno)
//
//  Recibe un webhook de Supabase cuando se inserta un
//  decreto o un mensaje, y manda Web Push al otro usuario.
//
//  El cifrado Web Push (RFC 8291) y la firma VAPID (RFC 8292)
//  se delegan en la librería @negrel/webpush, basada en
//  Web Crypto y mantenida por la comunidad.
//
//  Variables de entorno requeridas (Supabase Dashboard →
//  Edge Functions → Secrets):
//    SUPABASE_URL              (automática)
//    SUPABASE_SERVICE_ROLE_KEY (automática)
//    VAPID_PUBLIC_KEY        ← clave pública VAPID (base64url)
//    VAPID_PRIVATE_KEY       ← clave privada VAPID (base64url)
//    VAPID_SUBJECT           ← mailto:tu@email.com
//    WEBHOOK_SECRET          ← secreto compartido con el Database Webhook
//    RESEND_API_KEY          ← API key de Resend (notificaciones por email)
//    EMAIL_FROM              ← remitente verificado, ej:
//                              Palacio Presidencial <noreply@tudominio.com>
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5.0';

// ── Helpers base64url ──────────────────────────────────
function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Convierte las claves VAPID en bruto (base64url) al formato JWK
// que espera @negrel/webpush.importVapidKeys().
function vapidKeysToJwk(publicB64: string, privateB64: string) {
  const pub = b64urlToBytes(publicB64); // 65 bytes: 0x04 || X(32) || Y(32)
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY inválida: se esperaba un punto P-256 sin comprimir (65 bytes)');
  }
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const d = privateB64.replace(/=/g, ''); // escalar de 32 bytes en base64url

  return {
    publicKey: {
      kty: 'EC', crv: 'P-256', x, y, ext: true, key_ops: ['verify'],
    } as JsonWebKey,
    privateKey: {
      kty: 'EC', crv: 'P-256', x, y, d, ext: true, key_ops: ['sign'],
    } as JsonWebKey,
  };
}

// ── Email (Resend) ─────────────────────────────────────
const ROLE_BY_USER_KEY: Record<string, string> = {
  presidente: 'president',
  ministro:   'minister',
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// deno-lint-ignore no-explicit-any
async function lookupEmailByUserKey(supabase: any, userKey: string): Promise<string | null> {
  const role = ROLE_BY_USER_KEY[userKey];
  if (!role) return null;
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('[Email] No se pudo listar usuarios:', error.message);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const user = (data?.users || []).find((u: any) => u.user_metadata?.role === role);
  return user?.email ?? null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from   = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) {
    console.error('[Email] RESEND_API_KEY o EMAIL_FROM no configurados');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
}

// ── Autenticación del webhook ──────────────────────────
function verifyWebhook(req: Request): boolean {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret) {
    console.error('WEBHOOK_SECRET no configurado');
    return false;
  }
  const bearer = req.headers.get('Authorization');
  const header = req.headers.get('x-webhook-secret');
  return bearer === `Bearer ${secret}` || header === secret;
}

// ── Application server (VAPID) — inicializado una sola vez ──
let appServerPromise: ReturnType<typeof webpush.ApplicationServer.new> | null = null;

function getAppServer() {
  if (!appServerPromise) {
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

    appServerPromise = (async () => {
      const vapidKeys = await webpush.importVapidKeys(
        vapidKeysToJwk(vapidPublic, vapidPrivate),
        { extractable: false },
      );
      return await webpush.ApplicationServer.new({
        contactInformation: vapidSubject,
        vapidKeys,
      });
    })().catch((err) => {
      // No cachear un fallo: permite reintentar tras corregir los secretos
      appServerPromise = null;
      throw err;
    });
  }
  return appServerPromise;
}

// ── Handler principal ──────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!verifyWebhook(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await req.json();

    // El webhook de Supabase envía { type, table, record, ... }
    const { type, table, record } = body;

    if (type && type !== 'INSERT') {
      return new Response('Event ignored', { status: 200 });
    }

    if (!record) {
      return new Response('No record', { status: 400 });
    }

    // Solo procesar INSERT en decretos y mensajes
    const isDecreto = table === 'decretos';
    const isMensaje = table === 'mensajes';
    if (!isDecreto && !isMensaje) {
      return new Response('Table not handled', { status: 200 });
    }

    // Determinar quién creó el evento y quién debe recibir la notif
    const authorKey  = isDecreto ? record.author_key : record.user_key;
    const targetKey  = authorKey === 'presidente' ? 'ministro' : 'presidente';

    // Construir el mensaje de la notificación
    let title: string;
    let notifBody: string;

    if (isDecreto) {
      const typeLabels: Record<string, string> = {
        reunion: '📅 Reunión', plan: '🗺 Plan', decreto: '📜 Decreto',
        mision: '🎯 Misión', pelicula: '🎬 Cine', juego: '🎮 Gaming',
      };
      const authorLabel = authorKey === 'presidente' ? 'Presidenta' : 'Ministro';
      title    = `Nuevo decreto — ${typeLabels[record.type] || record.type}`;
      notifBody = `${authorLabel}: ${record.title}`;
    } else {
      const authorLabel = authorKey === 'presidente' ? 'Presidenta' : 'Ministro';
      title    = `Mensaje de ${authorLabel}`;
      notifBody = record.body.length > 80 ? record.body.slice(0, 77) + '…' : record.body;
    }

    // Leer la suscripción push del destinatario desde la BD
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: sub, error: subError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_key', targetKey)
      .maybeSingle();

    // ── Push (no bloquea el email si no hay suscripción) ──
    if (subError || !sub) {
      console.log(`No push subscription for ${targetKey}:`, subError?.message);
    } else {
      const payload = JSON.stringify({
        title,
        body:  notifBody,
        icon:  'parthenon26.svg',
        badge: 'parthenon26.svg',
        tag:   isDecreto ? 'decreto' : 'mensaje',
        url:   './',
      });

      // Cifrar y enviar mediante la librería (RFC 8291 + VAPID)
      const appServer = await getAppServer();
      const subscriber = appServer.subscribe({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      });

      try {
        await subscriber.pushTextMessage(payload, {});
        console.log(`Push enviado a ${targetKey} ✓`);
      } catch (err) {
        const status = (err as { response?: Response })?.response?.status;
        // 404 / 410 = suscripción expirada → borrarla
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('user_key', targetKey);
          console.log(`Suscripción expirada para ${targetKey}, eliminada.`);
        } else {
          console.error('Push failed:', status ?? '', err);
        }
      }
    }

    // ── Email (Resend) — independiente del push ──
    // Reglas: decretos y mensajes notifican por email en ambos sentidos.
    const shouldEmail = isDecreto || isMensaje;

    if (shouldEmail) {
      try {
        const toEmail = await lookupEmailByUserKey(supabase, targetKey);
        if (!toEmail) {
          console.log(`[Email] Sin email para ${targetKey}, se omite.`);
        } else {
          const authorLabel = authorKey === 'presidente' ? 'Presidenta' : 'Ministro';
          let subject: string;
          let html: string;

          if (isDecreto) {
            const typeLabels: Record<string, string> = {
              reunion: 'Reunión', plan: 'Plan', decreto: 'Decreto',
              mision: 'Misión', pelicula: 'Cine', juego: 'Gaming',
            };
            const prioLabels: Record<string, string> = {
              alta: 'Alta', media: 'Media', baja: 'Baja',
            };
            const typeLabel = typeLabels[record.type] || record.type;
            const prioLabel = prioLabels[record.priority] || record.priority || '—';
            subject = `Nuevo decreto — ${escapeHtml(record.title)}`;
            html = `
              <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;">
                <h2 style="color:#8B6B4A;">Nuevo decreto presentado</h2>
                <p><strong>${escapeHtml(record.title)}</strong></p>
                <p style="color:#555;">
                  Tipo: ${escapeHtml(typeLabel)} · Prioridad: ${escapeHtml(prioLabel)}<br>
                  Presentado por: ${authorLabel}
                </p>
                ${record.description ? `<p>${escapeHtml(record.description)}</p>` : ''}
                <hr style="border:none;border-top:1px solid #ddd;">
                <p style="color:#999;font-size:.85em;">Palacio Presidencial — notificación automática.</p>
              </div>`;
          } else {
            subject = `Nuevo mensaje de ${authorLabel}`;
            html = `
              <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;">
                <h2 style="color:#8B6B4A;">Mensaje en la Línea Directa</h2>
                <p style="color:#555;">De: ${authorLabel}</p>
                <blockquote style="border-left:3px solid #8B6B4A;margin:0;padding:.5em 1em;color:#333;">
                  ${escapeHtml(record.body)}
                </blockquote>
                <hr style="border:none;border-top:1px solid #ddd;">
                <p style="color:#999;font-size:.85em;">Palacio Presidencial — notificación automática.</p>
              </div>`;
          }

          await sendEmail(toEmail, subject, html);
          console.log(`Email enviado a ${targetKey} via Resend ✓`);
        }
      } catch (err) {
        console.error('[Email] Error al enviar:', err);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Edge Function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
