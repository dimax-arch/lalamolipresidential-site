import { test } from 'node:test';
import assert from 'node:assert/strict';
import { userKeyFromAuthUser } from '../src/lib/roles.js';

test('userKeyFromAuthUser mapea roles válidos (user_metadata)', () => {
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'president' } }), 'presidente');
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'minister' } }), 'ministro');
});

test('userKeyFromAuthUser lee el rol desde app_metadata', () => {
  assert.equal(userKeyFromAuthUser({ app_metadata: { role: 'president' } }), 'presidente');
  assert.equal(userKeyFromAuthUser({ app_metadata: { role: 'minister' } }), 'ministro');
});

test('app_metadata tiene prioridad sobre user_metadata', () => {
  // El login OAuth de Spotify deja el rol en app_metadata; debe ganar aunque
  // user_metadata tenga otro valor (o esté vacío).
  assert.equal(
    userKeyFromAuthUser({
      app_metadata: { role: 'president' },
      user_metadata: { role: 'minister' },
    }),
    'presidente'
  );
});

test('userKeyFromAuthUser rechaza roles desconocidos o ausentes', () => {
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'admin' } }), null);
  assert.equal(userKeyFromAuthUser({ app_metadata: { role: 'admin' } }), null);
  assert.equal(userKeyFromAuthUser({}), null);
  assert.equal(userKeyFromAuthUser(null), null);
});
