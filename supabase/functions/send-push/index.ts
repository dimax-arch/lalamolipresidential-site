// ═══════════════════════════════════════════════════════
//  send-push/index.ts  —  Supabase Edge Function (Deno)
//
//  Recibe un webhook de Supabase cuando se inserta un
//  decreto o un mensaje, y manda Web Push al otro usuario.
//
//  Variables de entorno requeridas (Supabase Dashboard →
//  Project Settings → Edge Functions → Secrets):
//    SUPABASE_URL            (automática)
//    SUPABASE_SERVICE_ROLE_KEY (automática en Edge Functions)
//    VAPID_PUBLIC_KEY        ← generada con web-push
//    VAPID_PRIVATE_KEY       ← generada con web-push
//    VAPID_SUBJECT           ← tu email o URL, ej: mailto:tu@email.com
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── VAPID helpers (implementación nativa Deno, sin npm) ──
// Usamos la Web Crypto API de Deno para firmar el JWT VAPID.

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

const b64urlDecode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function buildVapidHeaders(
  endpoint: string,
  vapidPublic: string,
  vapidPrivate: string,
  subject: string,
): Promise<Record<string, string>> {
  const url      = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const now      = Math.floor(Date.now() / 1000);

  // JWT header + payload
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: now + 12 * 3600,
    sub: subject,
  })));

  const signingInput = `${header}.${payload}`;

  // Importar clave privada VAPID (formato base64url → raw PKCS8)
  const privateKeyBytes = b64urlDecode(vapidPrivate);

  // La clave privada VAPID es un entero de 32 bytes; necesitamos envolverla en PKCS8
  // Formato PKCS8 EC mínimo para P-256:
  const pkcs8Prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Prefix.length + 32);
  pkcs8.set(pkcs8Prefix);
  pkcs8.set(privateKeyBytes.slice(0, 32), pkcs8Prefix.length);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', pkcs8,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  const jwt = `${signingInput}.${b64url(sig)}`;

  return {
    'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
    'Content-Type':  'application/octet-stream',
    'TTL':           '86400',
  };
}

// ── Cifrado del payload (AES-128-GCM + ECDH-ES + HKDF) ──
// Implementación del protocolo RFC 8291 (Web Push Encryption)
async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ body: ArrayBuffer; headers: Record<string, string> }> {
  const enc  = new TextEncoder();
  const data = enc.encode(plaintext);

  // Claves del cliente
  const clientPublicKey = b64urlDecode(p256dhB64);
  const clientAuth      = b64urlDecode(authB64);

  // Generar clave efímera del servidor
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'],
  );
  const serverPublicKeyRaw = await crypto.subtle.exportKey('raw', serverKeyPair.publicKey);

  // Importar clave pública del cliente
  const clientKey = await crypto.subtle.importKey(
    'raw', clientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey }, serverKeyPair.privateKey, 256,
  );

  // Salt aleatorio (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF para derivar clave AES y nonce
  const ikm = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey', 'deriveBits']);

  // PRK mediante HKDF-Extract con auth
  const authInfo = enc.encode('Content-Encoding: auth\0');
  const prk = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: clientAuth, info: authInfo }, ikm, 256,
  );

  const prkKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveBits']);

  // keyinfo y nonceinfo
  const serverPublic = new Uint8Array(serverPublicKeyRaw);
  const keyInfo   = buildInfo('aesgcm',      clientPublicKey, serverPublic, enc);
  const nonceInfo = buildInfo('nonce',        clientPublicKey, serverPublic, enc);

  const keyBits   = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo   }, prkKey, 128);
  const nonceBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo }, prkKey, 96);

  const aesKey = await crypto.subtle.importKey('raw', keyBits, 'AES-GCM', false, ['encrypt']);

  // Padding mínimo (2 bytes de longitud + datos)
  const padded = new Uint8Array(2 + data.length);
  padded.set(data, 2);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonceBits }, aesKey, padded,
  );

  // Construir cuerpo según RFC 8291
  const body = new Uint8Array(salt.length + 4 + 1 + serverPublic.length + encrypted.byteLength);
  let offset = 0;
  body.set(salt, offset); offset += salt.length;
  // rs = 4096 (big-endian uint32)
  new DataView(body.buffer).setUint32(offset, 4096, false); offset += 4;
  body[offset] = serverPublic.length; offset += 1;
  body.set(serverPublic, offset); offset += serverPublic.length;
  body.set(new Uint8Array(encrypted), offset);

  return {
    body: body.buffer,
    headers: {
      'Content-Encoding': 'aesgcm',
      'Encryption':       `salt=${b64url(salt.buffer)}`,
      'Crypto-Key':       `dh=${b64url(serverPublicKeyRaw)}`,
    },
  };
}

function buildInfo(type: string, clientKey: Uint8Array, serverKey: Uint8Array, enc: TextEncoder): Uint8Array {
  const context = new Uint8Array(5 + 1 + 2 + clientKey.length + 2 + serverKey.length);
  const label   = enc.encode('P-256\0');
  let off = 0;
  context.set(label, off); off += label.length;
  new DataView(context.buffer).setUint16(off, clientKey.length, false); off += 2;
  context.set(clientKey, off); off += clientKey.length;
  new DataView(context.buffer).setUint16(off, serverKey.length, false); off += 2;
  context.set(serverKey, off);

  const infoStr  = enc.encode(`Content-Encoding: ${type}\0`);
  const info     = new Uint8Array(infoStr.length + context.length);
  info.set(infoStr);
  info.set(context, infoStr.length);
  return info;
}

// ── Handler principal ──────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const body = await req.json();

    // El webhook de Supabase envía { type, table, record, ... }
    const { table, record } = body;

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

    if (subError || !sub) {
      console.log(`No push subscription for ${targetKey}:`, subError?.message);
      return new Response('No subscription', { status: 200 });
    }

    // Construir payload JSON para la notificación
    const payload = JSON.stringify({
      title,
      body:  notifBody,
      icon:  '/parthenon26.svg',
      badge: '/parthenon26.svg',
      tag:   isDecreto ? 'decreto' : 'mensaje',
      url:   '/',
    });

    // Leer claves VAPID
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')!;
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')!;

    // Cifrar payload y construir cabeceras VAPID
    const { body: encBody, headers: encHeaders } = await encryptPayload(
      payload, sub.p256dh, sub.auth,
    );
    const vapidHeaders = await buildVapidHeaders(
      sub.endpoint, vapidPublic, vapidPrivate, vapidSubject,
    );

    // Enviar push al endpoint del navegador
    const pushRes = await fetch(sub.endpoint, {
      method:  'POST',
      headers: { ...vapidHeaders, ...encHeaders },
      body:    encBody,
    });

    if (!pushRes.ok) {
      const text = await pushRes.text();
      // 410 Gone = suscripción expirada, borrarla
      if (pushRes.status === 410) {
        await supabase.from('push_subscriptions').delete().eq('user_key', targetKey);
        console.log(`Suscripción expirada para ${targetKey}, eliminada.`);
      } else {
        console.error('Push failed:', pushRes.status, text);
      }
    } else {
      console.log(`Push enviado a ${targetKey} ✓`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Edge Function error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
