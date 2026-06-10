import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_TO_USER_KEY } from '../src/lib/constants.js';

function userKeyFromAuthUser(user) {
  const role = user?.user_metadata?.role;
  return ROLE_TO_USER_KEY[role] || null;
}

test('userKeyFromAuthUser mapea roles válidos', () => {
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'president' } }), 'presidente');
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'minister' } }), 'ministro');
});

test('userKeyFromAuthUser rechaza roles desconocidos', () => {
  assert.equal(userKeyFromAuthUser({ user_metadata: { role: 'admin' } }), null);
  assert.equal(userKeyFromAuthUser({}), null);
});
