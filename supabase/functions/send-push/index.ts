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

// ── Plantilla de email ─────────────────────────────────
// URL pública del sitio (para el botón y la imagen de la corona).
// Configurable con el secret APP_URL; por defecto el dominio de producción.
const APP_URL = (Deno.env.get('APP_URL') || 'https://lalamoliypipe.com').replace(/\/+$/, '');
const CROWN_URL = `${APP_URL}/coronalaureles.png`;

const TYPE_LABELS_EMAIL: Record<string, string> = {
  reunion: '📅 Reunión', plan: '🗺 Plan', decreto: '📜 Decreto',
  mision: '🎯 Misión', pelicula: '🎬 Cine', juego: '🎮 Gaming',
};

const PRIORITY_EMAIL: Record<string, { label: string; color: string }> = {
  alta:  { label: 'Alta',  color: '#8B1A1A' },
  media: { label: 'Media', color: '#8B6B4A' },
  baja:  { label: 'Baja',  color: '#1A4A2A' },
};

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatProposedDate(dateStr?: string | null, timeStr?: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateStr);
  let out = `${d} ${MONTHS_ES[m - 1] ?? ''} ${y}`;
  if (timeStr) out += ` · ${String(timeStr).slice(0, 5)}`;
  return out;
}

function formatTimestamp(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota',
    });
  } catch {
    return '';
  }
}

function detailRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:7px 0;font:600 11px/1.4 'Courier New',monospace;color:#8D8178;text-transform:uppercase;letter-spacing:.06em;width:135px;vertical-align:top;">${label}</td>
      <td style="padding:7px 0;font:400 15px/1.5 Georgia,serif;color:#3C2F2F;">${value}</td>
    </tr>`;
}

// ── Enlace "Añadir a Google Calendar" ──────────────────
// Usa la URL "template" de Google Calendar (sin API ni OAuth):
// abre el calendario con el evento pre-rellenado para que el
// destinatario solo confirme "Guardar".
const APP_TIMEZONE = 'America/Bogota';

function shiftDateTime(ymd: string, hhmm: string, addMinutes: number): string {
  const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const h = +hhmm.slice(0, 2), mi = +hhmm.slice(2, 4);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  dt.setUTCMinutes(dt.getUTCMinutes() + addMinutes);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}00`;
}

function nextDay(ymd: string): string {
  const y = +ymd.slice(0, 4), mo = +ymd.slice(4, 6), d = +ymd.slice(6, 8);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}`;
}

function buildCalendarUrl(opts: {
  title: string;
  dateStr?: string | null;
  timeStr?: string | null;
  details?: string | null;
}): string | null {
  const { title, dateStr, timeStr, details } = opts;
  if (!dateStr) return null;
  const ymd = String(dateStr).replace(/-/g, '');
  if (ymd.length !== 8) return null;

  const params = new URLSearchParams({ action: 'TEMPLATE', text: title });

  if (timeStr) {
    const hhmm = String(timeStr).slice(0, 5).replace(':', '');
    const start = `${ymd}T${hhmm}00`;
    const end = shiftDateTime(ymd, hhmm, 60); // duración por defecto: 1 hora
    params.set('dates', `${start}/${end}`);
    params.set('ctz', APP_TIMEZONE);
  } else {
    // Evento de todo el día (la fecha de fin es exclusiva → día siguiente)
    params.set('dates', `${ymd}/${nextDay(ymd)}`);
  }

  if (details) params.set('details', details);
  params.set('location', 'Palacio Presidencial');

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderEmailShell(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  ctaLabel: string;
  secondaryCta?: { label: string; url: string; icon?: string };
}): string {
  const { preheader, heading, bodyHtml, ctaLabel, secondaryCta } = opts;
  const secondaryHtml = secondaryCta
    ? `<td style="width:12px;"></td>
                  <td style="background:#FFFFFF;border:1px solid #DADCE0;border-radius:4px;">
                    <a href="${secondaryCta.url}" style="display:inline-block;height:40px;padding:0 18px;font:500 14px/40px Arial,'Roboto',sans-serif;color:#3C4043;text-decoration:none;white-space:nowrap;">${secondaryCta.icon ? `<img src="${secondaryCta.icon}" width="18" height="18" alt="" style="vertical-align:middle;margin-right:10px;border:0;">` : ''}${secondaryCta.label}</a>
                  </td>`
    : '';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#1F1A18;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;color:#1F1A18;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1F1A18;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#F8F4EF;border:1px solid #6D4C41;border-top:3px solid #8B6B4A;box-shadow:0 20px 60px rgba(0,0,0,.4);">
          <tr>
            <td style="background:#2A2321;padding:26px 24px;text-align:center;border-bottom:2px solid #8B6B4A;">
              <img src="${CROWN_URL}" width="56" height="56" alt="Palacio Presidencial" style="display:block;margin:0 auto 12px;border:0;">
              <div style="font:600 11px/1 'Courier New',monospace;letter-spacing:.22em;text-transform:uppercase;color:#A58568;margin-bottom:8px;">Documento Clasificado — Uso Interno</div>
              <div style="font:700 22px/1.2 Georgia,serif;color:#FFFFFF;">Gestión Presidencial</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0 0 18px;font:700 16px/1.3 Georgia,serif;color:#8B6B4A;letter-spacing:.02em;">${heading}</h1>
              ${bodyHtml}
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
                <tr>
                  <td style="background:#8B6B4A;">
                    <a href="${APP_URL}" style="display:inline-block;padding:13px 30px;font:600 13px/1 Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${ctaLabel} →</a>
                  </td>
                  ${secondaryHtml}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid #E0D5C5;">
              <div style="font:italic 400 13px/1.5 Georgia,serif;color:#8D8178;">Palacio Presidencial — notificación automática.</div>
              <div style="font:400 11px/1.5 'Courier New',monospace;color:#B3A99E;margin-top:6px;">No respondas a este correo. Ingresa al sistema para gestionar los asuntos de Estado.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
            const typeLabel = TYPE_LABELS_EMAIL[record.type] || record.type;
            const prio = PRIORITY_EMAIL[record.priority] ||
              { label: record.priority || '—', color: '#8B6B4A' };
            const fecha = formatProposedDate(record.proposed_date, record.proposed_time);
            const registrado = formatTimestamp(record.created_at);

            const rows = [
              detailRow('Tipo', escapeHtml(typeLabel)),
              detailRow(
                'Prioridad',
                `<span style="display:inline-block;padding:2px 10px;border:1px solid ${prio.color};color:${prio.color};font:600 12px/1.4 'Courier New',monospace;text-transform:uppercase;letter-spacing:.05em;">${escapeHtml(prio.label)}</span>`,
              ),
              fecha ? detailRow('Fecha propuesta', escapeHtml(fecha)) : '',
              detailRow('Presentado por', escapeHtml(authorLabel)),
              registrado ? detailRow('Registrado', escapeHtml(registrado)) : '',
            ].join('');

            const descBlock = record.description
              ? `<div style="margin:20px 0 0;padding:14px 16px;background:#EDE4D8;border-left:3px solid #8B6B4A;font:400 15px/1.6 Georgia,serif;color:#3C2F2F;white-space:pre-wrap;">${escapeHtml(record.description)}</div>`
              : '';

            const body = `
              <p style="margin:0 0 20px;font:700 21px/1.3 Georgia,serif;color:#3C2F2F;">${escapeHtml(record.title)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E0D5C5;border-bottom:1px solid #E0D5C5;">
                ${rows}
              </table>
              ${descBlock}
              <p style="margin:22px 0 0;font:italic 400 14px/1.6 Georgia,serif;color:#6D4C41;">Ingresa al Palacio para aprobar o rechazar este decreto.</p>`;

            const calDetails = [
              record.description ? String(record.description) : '',
              `Decreto presentado por ${authorLabel}.`,
              `Gestiónalo en ${APP_URL}`,
            ].filter(Boolean).join('\n\n');
            const calUrl = buildCalendarUrl({
              title: record.title,
              dateStr: record.proposed_date,
              timeStr: record.proposed_time,
              details: calDetails,
            });

            subject = `📜 Nuevo decreto — ${record.title}`;
            html = renderEmailShell({
              preheader: `${authorLabel} presentó: ${escapeHtml(record.title)}`,
              heading: 'Nuevo decreto presentado',
              bodyHtml: body,
              ctaLabel: 'Abrir la aplicación',
              secondaryCta: calUrl
                ? { label: 'Añadir a Google Calendar', url: calUrl, icon: `${APP_URL}/google-calendar.png` }
                : undefined,
            });
          } else {
            const cuando = formatTimestamp(record.created_at);
            const body = `
              <p style="margin:0 0 14px;font:400 15px/1.5 Georgia,serif;color:#3C2F2F;">
                <span style="color:#8D8178;">De:</span> <strong>${escapeHtml(authorLabel)}</strong>${cuando ? ` <span style="color:#B3A99E;font:400 13px/1 'Courier New',monospace;">· ${escapeHtml(cuando)}</span>` : ''}
              </p>
              <div style="margin:0;padding:16px 18px;background:#EDE4D8;border-left:3px solid #8B6B4A;font:400 16px/1.6 Georgia,serif;color:#3C2F2F;white-space:pre-wrap;">${escapeHtml(record.body)}</div>
              <p style="margin:22px 0 0;font:italic 400 14px/1.6 Georgia,serif;color:#6D4C41;">Responde desde la Línea Directa del Palacio.</p>`;

            subject = `📡 Nuevo mensaje de ${authorLabel}`;
            html = renderEmailShell({
              preheader: `${escapeHtml(authorLabel)}: ${escapeHtml(String(record.body).slice(0, 90))}`,
              heading: 'Mensaje en la Línea Directa',
              bodyHtml: body,
              ctaLabel: 'Responder en la aplicación',
            });
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
