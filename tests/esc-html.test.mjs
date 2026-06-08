import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mantener en sync con escHtml() en app.js
function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

test('escHtml neutraliza HTML y comillas', () => {
  assert.equal(escHtml('<script>"\'&"</script>'), '&lt;script&gt;&quot;&#39;&amp;&quot;&lt;/script&gt;');
  assert.equal(escHtml('texto normal'), 'texto normal');
});
