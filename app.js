/* ═══════════════════════════════════════════════════════
   PALACIO PRESIDENCIAL — app.js
   Autenticación: Supabase Auth (email + contraseña)
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────
   PERFILES POR ROL (metadata de Supabase)
───────────────────────────────────────────── */
const USERS = {
  presidente: {
    role: 'president',
    label: '🎖 PRESIDENTE',
    short: 'Presidente',
    logClass: 'log-role--president',
  },
  ministro: {
    role: 'minister',
    label: '📋 MINISTRO',
    short: 'Ministro',
    logClass: 'log-role--minister',
  },
};

const ROLE_TO_USER_KEY = {
  president: 'presidente',
  minister: 'ministro',
};

/* ─────────────────────────────────────────────
   LOOKUP TABLES
───────────────────────────────────────────── */
const TYPE_LABELS = {
  reunion:  '📅 Reunión',
  plan:     '🗺 Plan',
  decreto:  '📜 Decreto',
  mision:   '🎯 Misión',
  pelicula: '🎬 Cine',
  juego:    '🎮 Gaming',
};

const PRIORITY_LABELS = {
  alta:  '🔴 Alta',
  media: '🟡 Media',
  baja:  '🟢 Baja',
};

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let supabaseClient = null;
let currentUser    = null;   // 'presidente' | 'ministro'
let currentAuthId  = null;   // uuid de Supabase
let items          = [];
let messages       = [];
let lastSeenMsgCount = 0;
let activeFilter   = 'all';
let realtimeChannel = null;
let refreshDecretosTimer = null;
let refreshMensajesTimer = null;

/* ─────────────────────────────────────────────
   SUPABASE
───────────────────────────────────────────── */
function initSupabase() {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (!url || !key || url.includes('TU_PROYECTO')) {
    showLoginError(
      'Falta configurar Supabase. Copia supabase-config.example.js → supabase-config.js y añade URL y clave anon.'
    );
    return false;
  }

  if (!window.supabase?.createClient) {
    showLoginError('No se cargó la biblioteca de Supabase. Comprueba tu conexión.');
    return false;
  }

  supabaseClient = window.supabase.createClient(url, key);
  return true;
}

function userKeyFromAuthUser(user) {
  const role = user.user_metadata?.role;
  return ROLE_TO_USER_KEY[role] || null;
}

function authErrorMessage(error) {
  const map = {
    'Invalid login credentials': 'Credenciales inválidas. Acceso denegado.',
    'Email not confirmed': 'Debe confirmar su correo antes de acceder.',
    'User not found': 'Usuario no registrado en el sistema.',
  };
  return map[error.message] || error.message || 'Error de autenticación.';
}

async function initAuth() {
  if (!initSupabase()) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    enterApp(session.user, false);
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      const key = userKeyFromAuthUser(session.user);
      if (key && key !== currentUser) {
        enterApp(session.user, false);
      }
    } else if (currentUser) {
      leaveApp(false);
    }
  });
}

/* ─────────────────────────────────────────────
   SYNC — Supabase + tiempo real
───────────────────────────────────────────── */
function formatCreated(iso) {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

function formatMessageTime(iso) {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

function rowToItem(row) {
  return {
    id:       row.id,
    title:    row.title,
    type:     row.type,
    date:     row.proposed_date || '',
    time:     row.proposed_time ? String(row.proposed_time).slice(0, 5) : '',
    desc:     row.description || '',
    priority: row.priority,
    status:   row.status,
    author:   row.author_key,
    authorId: row.author_id,
    created:  formatCreated(row.created_at),
  };
}

function rowToMessage(row) {
  return {
    id:      row.id,
    userKey: row.user_key,
    text:    row.body,
    ts:      formatMessageTime(row.created_at),
  };
}

function dbErrorToast(error, fallback) {
  console.error(error);
  showToast(fallback + (error?.message ? ': ' + error.message : ''), 'error');
}

async function loadPalacioData() {
  if (!supabaseClient) return;

  const [decretosRes, mensajesRes] = await Promise.all([
    supabaseClient.from('decretos').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('mensajes').select('*').order('created_at', { ascending: true }),
  ]);

  if (decretosRes.error) {
    dbErrorToast(decretosRes.error, 'No se pudieron cargar los decretos');
    items = [];
  } else {
    items = (decretosRes.data || []).map(rowToItem);
  }

  if (mensajesRes.error) {
    dbErrorToast(mensajesRes.error, 'No se pudo cargar el canal');
    messages = [];
  } else {
    messages = (mensajesRes.data || []).map(rowToMessage);
  }

  lastSeenMsgCount = messages.length;
}

async function refreshDecretosFromServer() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from('decretos')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return;
  items = (data || []).map(rowToItem);
  renderItems();
  updateStats();
}

async function refreshMensajesFromServer() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from('mensajes')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) return;
  const prevCount = messages.length;
  messages = (data || []).map(rowToMessage);
  renderLog();
  if (messages.length > prevCount && messages.length > lastSeenMsgCount) {
    lastSeenMsgCount = prevCount;
  }
}

function scheduleRefreshDecretos() {
  clearTimeout(refreshDecretosTimer);
  refreshDecretosTimer = setTimeout(refreshDecretosFromServer, 120);
}

function scheduleRefreshMensajes() {
  clearTimeout(refreshMensajesTimer);
  refreshMensajesTimer = setTimeout(refreshMensajesFromServer, 120);
}

function subscribeRealtime() {
  unsubscribeRealtime();
  if (!supabaseClient) return;

  realtimeChannel = supabaseClient
    .channel('palacio-sync')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'decretos' },
      () => scheduleRefreshDecretos()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'mensajes' },
      () => scheduleRefreshMensajes()
    )
    .subscribe();
}

function unsubscribeRealtime() {
  clearTimeout(refreshDecretosTimer);
  clearTimeout(refreshMensajesTimer);
  if (realtimeChannel && supabaseClient) {
    supabaseClient.removeChannel(realtimeChannel);
  }
  realtimeChannel = null;
}

/* ─────────────────────────────────────────────
   LOGIN / LOGOUT
───────────────────────────────────────────── */
function showLoginError(msg) {
  const errorEl = document.getElementById('loginError');
  if (!errorEl) return;
  errorEl.textContent = msg;
  if (msg) {
    errorEl.style.animation = 'none';
    requestAnimationFrame(() => { errorEl.style.animation = ''; });
  }
}

function setLoginLoading(loading) {
  const btn = document.getElementById('loginBtn');
  const userInput = document.getElementById('loginUser');
  const passInput = document.getElementById('loginPass');
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Verificando…' : 'Verificar Identidad ⚑';
  }
  if (userInput) userInput.disabled = loading;
  if (passInput) passInput.disabled = loading;
}

async function attemptLogin() {
  if (!supabaseClient && !initSupabase()) return;

  const email    = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;

  if (!email || !password) {
    showLoginError('Indique correo y contraseña.');
    return;
  }

  showLoginError('');
  setLoginLoading(true);

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  setLoginLoading(false);

  if (error) {
    showLoginError(authErrorMessage(error));
    return;
  }

  const userKey = userKeyFromAuthUser(data.user);
  if (!userKey) {
    await supabaseClient.auth.signOut();
    showLoginError(
      'Su cuenta no tiene rol asignado. En Supabase, añada user_metadata: { "role": "president" } o "minister".'
    );
    return;
  }

  enterApp(data.user, true);
}

async function enterApp(user, showWelcomeToast) {
  const userKey = userKeyFromAuthUser(user);
  if (!userKey) return;

  const profile = USERS[userKey];
  const isNewSession = currentUser !== userKey;
  currentUser   = userKey;
  currentAuthId = user.id;

  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('appWrapper').style.display = '';
  document.getElementById('sessionLabel').textContent = profile.label;

  await loadPalacioData();
  if (isNewSession) subscribeRealtime();

  renderItems();
  renderLog();
  updateStats();

  if (showWelcomeToast) {
    showToast('Acceso concedido. Bienvenido/a, ' + profile.short + '.', 'success');
  }
}

function leaveApp(clearForm) {
  unsubscribeRealtime();
  items = [];
  messages = [];
  currentUser   = null;
  currentAuthId = null;
  document.getElementById('loginOverlay').style.display = '';
  document.getElementById('appWrapper').style.display = 'none';
  if (clearForm) {
    document.getElementById('loginUser').value  = '';
    document.getElementById('loginPass').value  = '';
    document.getElementById('loginError').textContent = '';
  }
  activeFilter = 'all';
}

async function logout() {
  setLoginLoading(false);
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  leaveApp(true);
}

function togglePass() {
  const input = document.getElementById('loginPass');
  input.type = input.type === 'password' ? 'text' : 'password';
}

/* ─────────────────────────────────────────────
   SUBMIT ITEM
───────────────────────────────────────────── */
async function submitItem() {
  if (!currentUser || !supabaseClient) return;

  const title    = document.getElementById('itemTitle').value.trim();
  const type     = document.getElementById('itemType').value;
  const date     = document.getElementById('itemDate').value;
  const time     = document.getElementById('itemTime').value;
  const desc     = document.getElementById('itemDesc').value.trim();
  const priority = document.getElementById('itemPriority').value;

  if (!title) {
    showToast('Falta el título del decreto.', 'error');
    document.getElementById('itemTitle').focus();
    return;
  }

  const { data, error } = await supabaseClient
    .from('decretos')
    .insert({
      title,
      type,
      proposed_date: date || null,
      proposed_time: time || null,
      description:   desc,
      priority,
      status:        'pending',
      author_key:    currentUser,
      author_id:     currentAuthId,
    })
    .select()
    .single();

  if (error) {
    dbErrorToast(error, 'No se pudo registrar el decreto');
    return;
  }

  items.unshift(rowToItem(data));
  renderItems();
  updateStats();

  document.getElementById('itemTitle').value = '';
  document.getElementById('itemDesc').value  = '';
  document.getElementById('itemDate').value  = '';
  document.getElementById('itemTime').value  = '';

  await addLogEntry(currentUser, `[DECRETO] "${title}" — ${TYPE_LABELS[type]}`);
  showToast('Decreto presentado al Consejo. ⚑', 'success');
}

/* ─────────────────────────────────────────────
   ITEM ACTIONS
───────────────────────────────────────────── */
async function approveItem(id) {
  const item = items.find(i => i.id === id);
  if (!item || !supabaseClient) return;

  if (item.author === currentUser && item.status === 'pending') {
    showToast('No puede aprobar sus propios decretos.', 'error');
    return;
  }

  const { error } = await supabaseClient
    .from('decretos')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) {
    dbErrorToast(error, 'No se pudo aprobar');
    return;
  }

  item.status = 'approved';
  renderItems();
  updateStats();
  await addLogEntry(currentUser, `[APROBADO] "${item.title}"`);
  showToast('Decreto aprobado. ✓', 'success');
}

async function rejectItem(id) {
  const item = items.find(i => i.id === id);
  if (!item || !supabaseClient) return;

  const { error } = await supabaseClient
    .from('decretos')
    .update({ status: 'rejected' })
    .eq('id', id);

  if (error) {
    dbErrorToast(error, 'No se pudo rechazar');
    return;
  }

  item.status = 'rejected';
  renderItems();
  updateStats();
  await addLogEntry(currentUser, `[RECHAZADO] "${item.title}"`);
  showToast('Decreto rechazado.', 'error');
}

async function deleteItem(id) {
  if (!confirm('¿Eliminar este asunto del registro oficial?')) return;
  if (!supabaseClient) return;

  const { error } = await supabaseClient.from('decretos').delete().eq('id', id);
  if (error) {
    dbErrorToast(error, 'No se pudo eliminar');
    return;
  }

  items = items.filter(i => i.id !== id);
  renderItems();
  updateStats();
  showToast('Asunto eliminado del archivo.');
}

/* ─────────────────────────────────────────────
   FILTER
───────────────────────────────────────────── */
function setFilter(filter, btn) {
  activeFilter = filter;

  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  renderItems();
}

/* ─────────────────────────────────────────────
   RENDER ITEMS
───────────────────────────────────────────── */
function renderItems() {
  const list = document.getElementById('itemList');

  let visible = items;
  if (activeFilter !== 'all') {
    visible = items.filter(i => i.status === activeFilter);
  }

  const pending = items.filter(i => i.status === 'pending').length;
  document.getElementById('pendingBadge').textContent = pending + ' PENDIENTES';

  if (visible.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏛</div>
        <div class="empty-text">No hay asuntos en esta categoría.</div>
      </div>`;
    return;
  }

  list.innerHTML = visible.map(item => buildItemCard(item)).join('');
}

function buildItemCard(item) {
  const authorUser = USERS[item.author];

  let borderClass = '';
  if (item.status === 'approved') borderClass = 'item-card--green';
  else if (item.status === 'rejected') borderClass = 'item-card--red';
  const dimClass = (item.status !== 'pending') ? 'item-card--dimmed' : '';

  const statusMap = {
    pending:  `<span class="status-badge status-badge--pending">Pendiente</span>`,
    approved: `<span class="status-badge status-badge--approved">Aprobado ✓</span>`,
    rejected: `<span class="status-badge status-badge--rejected">Rechazado ✗</span>`,
  };
  const badge = statusMap[item.status] || '';

  const dateStr = item.date
    ? ` — ${item.date}${item.time ? ' ' + item.time : ''}`
    : '';

  const canAct       = item.status === 'pending';
  const isOwnItem    = item.author === currentUser;
  const canApprove   = canAct && !isOwnItem;
  const canReject    = canAct;
  const canDelete    = !canAct || isOwnItem;

  const idAttr = escHtml(item.id);
  const approveBtn = canApprove
    ? `<button class="btn-small btn-small--approve" onclick="approveItem('${idAttr}')">✓ Aprobar</button>`
    : '';
  const rejectBtn  = canReject
    ? `<button class="btn-small btn-small--reject"  onclick="rejectItem('${idAttr}')">✗ Rechazar</button>`
    : '';
  const deleteBtn  = canDelete
    ? `<button class="btn-small btn-small--delete"  onclick="deleteItem('${idAttr}')">✕ Eliminar</button>`
    : '';

  const descHtml = item.desc
    ? `<div class="item-desc">${escHtml(item.desc)}</div>`
    : '';

  return `
    <div class="item-card ${borderClass} ${dimClass}">
      <div class="item-top">
        <div>
          <div class="item-meta">
            ${TYPE_LABELS[item.type] || item.type} &nbsp;·&nbsp;
            ${PRIORITY_LABELS[item.priority] || item.priority}${dateStr}
          </div>
          <div class="item-title">${escHtml(item.title)}</div>
        </div>
        ${badge}
      </div>
      ${descHtml}
      <div class="item-meta" style="margin-top:0.45rem;">
        Propuesto por: ${authorUser ? authorUser.short : item.author} · ${item.created}
      </div>
      <div class="item-actions">
        ${approveBtn}
        ${rejectBtn}
        ${deleteBtn}
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────
   STATS
───────────────────────────────────────────── */
function updateStats() {
  document.getElementById('stat-total').textContent   = items.length;
  document.getElementById('stat-pending').textContent = items.filter(i => i.status === 'pending').length;
  document.getElementById('stat-approved').textContent= items.filter(i => i.status === 'approved').length;
}

/* ─────────────────────────────────────────────
   MESSAGES / LOG
───────────────────────────────────────────── */
async function sendMessage() {
  if (!currentUser || !supabaseClient) return;
  const input = document.getElementById('msgInput');
  const text  = input.value.trim();
  if (!text) return;

  const { data, error } = await supabaseClient
    .from('mensajes')
    .insert({ user_key: currentUser, body: text })
    .select()
    .single();

  if (error) {
    dbErrorToast(error, 'No se pudo enviar el mensaje');
    return;
  }

  messages.push(rowToMessage(data));
  input.value = '';
  renderLog();
}

async function addLogEntry(userKey, text) {
  if (!supabaseClient) return;

  const { data, error } = await supabaseClient
    .from('mensajes')
    .insert({ user_key: userKey, body: text })
    .select()
    .single();

  if (error) {
    console.error(error);
    return;
  }

  messages.push(rowToMessage(data));
  renderLog();
}

function renderLog() {
  const area = document.getElementById('logArea');

  if (messages.length === 0) {
    area.innerHTML = `
      <div class="log-entry">
        <span class="log-ts">──</span>
        <span class="log-msg log-msg--system">Canal de comunicación activo. Bienvenido/a al Palacio.</span>
      </div>`;
    return;
  }

  area.innerHTML = messages.map(m => {
    const user      = USERS[m.userKey];
    const roleClass = user ? user.logClass : '';
    const roleName  = user ? user.short.toUpperCase() : m.userKey.toUpperCase();
    return `
      <div class="log-entry">
        <span class="log-ts">[${m.ts}]</span>
        <span class="log-role ${roleClass}">${roleName}:</span>
        <span class="log-msg">${escHtml(m.text)}</span>
      </div>`;
  }).join('');

  area.scrollTop = area.scrollHeight;

  if (messages.length > lastSeenMsgCount) {
    const badge = document.getElementById('unreadBadge');
    badge.style.display = '';
    setTimeout(() => {
      badge.style.display = 'none';
      lastSeenMsgCount = messages.length;
    }, 3000);
  }
}

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
function showToast(msg, type) {
  const container = document.getElementById('toastContainer');
  const el        = document.createElement('div');
  el.className    = 'toast' + (type ? ' toast--' + type : '');
  el.textContent  = msg;
  container.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease both';
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

/* ─────────────────────────────────────────────
   PARTICLES (login bg)
───────────────────────────────────────────── */
function spawnParticles() {
  const container = document.getElementById('loginParticles');
  if (!container) return;

  const count = 40;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const x     = Math.random() * 100;
    const y     = Math.random() * 100;
    const dur   = 5 + Math.random() * 8;
    const delay = Math.random() * 8;
    const size  = 1 + Math.random() * 2;

    p.style.cssText = `
      left: ${x}%;
      top:  ${y}%;
      width: ${size}px;
      height: ${size}px;
      --dur:   ${dur}s;
      --delay: ${delay}s;
    `;
    container.appendChild(p);
  }
}

/* ─────────────────────────────────────────────
   UTILS
───────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  spawnParticles();
  initAuth();

  document.getElementById('loginUser').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('loginPass').focus();
  });
});
