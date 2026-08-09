// Helpers puros de la card de Genshin: cuentas regresivas y valores "en vivo"
// derivados de las Notas en Tiempo Real. La Edge Function `genshin-notes`
// entrega los datos con un `fetchedAt`; aquí se proyectan al instante actual
// para que la card avance sin refetch (la resina sube 1 cada 8 minutos).

export const RESIN_SECONDS = 480; // 8 min por punto de resina

// Segundos restantes de una cuenta regresiva capturada en `fetchedAtMs`,
// vista en `nowMs`. Nunca negativo.
export function remainingSeconds(baseSeconds, fetchedAtMs, nowMs) {
  const elapsed = Math.max(0, (nowMs - fetchedAtMs) / 1000);
  return Math.max(0, Math.round(baseSeconds - elapsed));
}

// Resina actual proyectada. Se deriva del tiempo restante para no adelantarse
// al servidor: con `remaining` segundos para llenar, faltan ceil(remaining/480)
// puntos. Nunca por debajo de lo que reportó la API.
export function liveResin(currentResin, maxResin, remaining) {
  if (remaining <= 0) return maxResin;
  const missing = Math.ceil(remaining / RESIN_SECONDS);
  return Math.max(currentResin, maxResin - missing);
}

// Ritmo de monedas del reino en monedas/hora, estimado a partir del tiempo
// que la API dice que falta para llenar la tetera. null si no se puede saber
// (tetera llena o sin datos).
export function coinsPerHour(currentCoins, maxCoins, recoverySeconds) {
  const missing = maxCoins - currentCoins;
  if (missing <= 0 || recoverySeconds <= 0) return null;
  return Math.round((missing / recoverySeconds) * 3600);
}

// "6 h 24 min", "3 d 2 h", "45 min", "58 s". Para countdowns de la card.
export function formatDuration(seconds) {
  if (seconds <= 0) return '0 s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${Math.floor(seconds)} s`;
}

// Hora local en la que termina un countdown: "14:32", "mañana 07:12" o
// "12 ago" si cae más allá. `nowMs` inyectable para tests.
export function endTimeLabel(remaining, nowMs = Date.now()) {
  const end = new Date(nowMs + remaining * 1000);
  const now = new Date(nowMs);
  const hhmm = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  const dayDiff =
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()) -
      new Date(now.getFullYear(), now.getMonth(), now.getDate())) /
    86400000;
  if (dayDiff === 0) return hhmm;
  if (dayDiff === 1) return `mañana ${hhmm}`;
  return end.toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
