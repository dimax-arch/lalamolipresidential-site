import { VAPID_PUBLIC_KEY } from './constants';

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export function isVapidConfigured() {
  return VAPID_PUBLIC_KEY && VAPID_PUBLIC_KEY !== 'TU_VAPID_PUBLIC_KEY_AQUI';
}

// Convierte una VAPID public key base64url → Uint8Array
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;
  return navigator.serviceWorker.register(swUrl);
}

function sameApplicationServerKey(subscription, expectedKey) {
  const existing = subscription.options?.applicationServerKey;
  if (!existing) return false;
  const a = new Uint8Array(existing);
  if (a.length !== expectedKey.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== expectedKey[i]) return false;
  }
  return true;
}

async function savePushSubscription(supabase, authId, userKey, subscription) {
  if (!supabase || !authId || !userKey) return;
  const { endpoint, keys } = subscription.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: authId,
      user_key: userKey,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: 'user_id' }
  );
  if (error) console.error('[Push] Error guardando suscripción:', error);
}

export async function subscribeAndSave(registration, supabase, authId, userKey) {
  if (!registration) return;

  const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  let subscription = await registration.pushManager.getSubscription();

  // Si la suscripción se creó con otra clave VAPID, FCM devolverá 403.
  // La descartamos y volvemos a suscribir con la clave actual.
  if (subscription && !sameApplicationServerKey(subscription, appServerKey)) {
    console.log('[Push] Clave VAPID cambiada; renovando suscripción.');
    try {
      await subscription.unsubscribe();
    } catch (_) {
      /* noop */
    }
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  await savePushSubscription(supabase, authId, userKey, subscription);
  console.log('[Push] Suscripción activa ✓');
}
