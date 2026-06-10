// ═══════════════════════════════════════════════════════
//  service-worker.js  —  Palacio Presidencial
// ═══════════════════════════════════════════════════════

'use strict';

function assetUrl(path) {
  return new URL(path, self.registration.scope).href;
}

// ── Instalación ──
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Recibir notificación push ──────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Palacio Presidencial',
      body:  event.data.text(),
      icon:  'parthenon26.svg',
    };
  }

  const options = {
    body:             payload.body  || '',
    icon:             payload.icon  ? assetUrl(payload.icon.replace(/^\//, '')) : assetUrl('parthenon26.svg'),
    badge:            payload.badge ? assetUrl(payload.badge.replace(/^\//, '')) : assetUrl('parthenon26.svg'),
    tag:              payload.tag   || 'palacio',
    renotify:         true,
    requireInteraction: false,
    silent:           false,
    vibrate:          [200, 100, 200],
    data: {
      url: payload.url || './',
    },
    actions: [
      { action: 'open', title: 'Abrir Palacio' },
      { action: 'dismiss', title: 'Ignorar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Palacio Presidencial', options)
  );
});

// ── Clic en la notificación ────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = assetUrl(
    (event.notification.data?.url || './').replace(/^\//, '')
  );

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const scope = self.registration.scope;
      for (const client of windowClients) {
        if (client.url.startsWith(scope)) {
          client.focus();
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('notificationclose', () => {});
