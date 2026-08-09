import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  remainingSeconds,
  liveResin,
  coinsPerHour,
  formatDuration,
  endTimeLabel,
} from '../src/lib/genshin.js';

test('remainingSeconds descuenta el tiempo transcurrido y no baja de 0', () => {
  const fetched = 1_000_000;
  assert.equal(remainingSeconds(600, fetched, fetched), 600);
  assert.equal(remainingSeconds(600, fetched, fetched + 90_000), 510);
  assert.equal(remainingSeconds(600, fetched, fetched + 999_000), 0);
});

test('liveResin proyecta la resina sin adelantarse al servidor', () => {
  // 152/200 con 6h24m restantes → faltan exactamente 48 puntos.
  assert.equal(liveResin(152, 200, 48 * 480), 152);
  // Pasan 8 min (un punto menos por recuperar) → 153.
  assert.equal(liveResin(152, 200, 47 * 480), 153);
  // A mitad de un punto sigue en 152 (ceil no lo regala antes de tiempo).
  assert.equal(liveResin(152, 200, 48 * 480 - 240), 152);
  // Countdown agotado → llena.
  assert.equal(liveResin(152, 200, 0), 200);
  // Nunca por debajo de lo que reportó la API.
  assert.equal(liveResin(180, 200, 48 * 480), 180);
});

test('coinsPerHour estima el ritmo de la tetera', () => {
  // Faltan 600 monedas y 20h para llenar → 30/h.
  assert.equal(coinsPerHour(1800, 2400, 20 * 3600), 30);
  // Tetera llena o datos raros → null.
  assert.equal(coinsPerHour(2400, 2400, 0), null);
  assert.equal(coinsPerHour(2400, 2400, 100), null);
});

test('formatDuration elige la unidad adecuada', () => {
  assert.equal(formatDuration(0), '0 s');
  assert.equal(formatDuration(58), '58 s');
  assert.equal(formatDuration(45 * 60), '45 min');
  assert.equal(formatDuration(6 * 3600 + 24 * 60), '6 h 24 min');
  assert.equal(formatDuration(2 * 3600), '2 h');
  assert.equal(formatDuration(3 * 86400 + 2 * 3600), '3 d 2 h');
});

test('endTimeLabel distingue hoy, mañana y fechas lejanas', () => {
  // Base: mediodía local (evita sorpresas de zona horaria en CI).
  const noon = new Date(2026, 7, 9, 12, 0, 0).getTime();
  assert.equal(endTimeLabel(2 * 3600 + 32 * 60, noon), '14:32');
  assert.equal(endTimeLabel(19 * 3600 + 12 * 60, noon), 'mañana 07:12');
  // +3 días → fecha corta, no hora.
  assert.match(endTimeLabel(3 * 86400, noon), /12/);
});
