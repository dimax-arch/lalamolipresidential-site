// ═══════════════════════════════════════════════════════
//  service-worker.js  —  Palacio Presidencial
//  Va en la RAÍZ del proyecto (junto a index.html)
// ═══════════════════════════════════════════════════════

'use strict';

const CACHE_NAME = 'palacio-v1';

// ── Instalación: nada que cachear por ahora ──
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
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
      icon:  '/parthenon26.svg',
    };
  }

  const options = {
    body:             payload.body  || '',
    icon:             payload.icon  || '/parthenon26.svg',
    badge:            payload.badge || '/parthenon26.svg',
    tag:              payload.tag   || 'palacio',
    renotify:         true,
    requireInteraction: false,
    silent:           false,
    vibrate:          [200, 100, 200],
    data: {
      url: payload.url || '/',
    },
    // Acciones rápidas (solo Android Chrome las muestra)
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

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una pestaña abierta con el sitio, la enfoca
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === '/' || clientUrl.pathname.startsWith('/index')) {
          client.focus();
          return;
        }
      }
      // Si no, abre una pestaña nueva
      return clients.openWindow(targetUrl);
    })
  );
});

// ── Notificación cerrada (opcional, para analytics) ────
self.addEventListener('notificationclose', (_event) => {
  // Aquí podrías registrar métricas si lo necesitas
});
