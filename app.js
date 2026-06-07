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
let decreto_logs    = [];
let refreshLogsTimer = null;
let logsFilter      = 'all';
let logsPage        = 0;
const LOGS_PER_PAGE = 20;

// ── Push notifications ──
let swRegistration  = null;   // ServiceWorkerRegistration
// Pega aquí tu VAPID public key (la que generarás en el paso de setup)
const VAPID_PUBLIC_KEY = 'BPSNRGSqEYNFFFBtN38k5oTZgG_T6fpke0Fvq23kIhp20MekDxbN2V1b-t29z9Ds9lPIycwJ7Tl5xHKR9a5tYcI';

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

function rowToLog(row) {
  return {
    id:             row.id,
    created_at:     row.created_at,
    decreto_id:     row.decreto_id,
    decreto_title:  row.decreto_title,
    decreto_type:   row.decreto_type,
    decreto_priority: row.decreto_priority,
    event_type:     row.event_type,
    actor_key:      row.actor_key,
    ts:             formatCreated(row.created_at),
  };
}

function dbErrorToast(error, fallback) {
  console.error(error);
  showToast(fallback + (error?.message ? ': ' + error.message : ''), 'error');
}

async function loadPalacioData() {
  if (!supabaseClient) return;

  const [decretosRes, mensajesRes, logsRes] = await Promise.all([
    supabaseClient.from('decretos').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('mensajes').select('*').order('created_at', { ascending: true }),
    supabaseClient.from('decreto_logs').select('*').order('created_at', { ascending: false }).limit(200),
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

  if (logsRes.error) {
    console.error(logsRes.error);
    decreto_logs = [];
  } else {
    decreto_logs = (logsRes.data || []).map(rowToLog);
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

async function refreshLogsFromServer() {
  if (!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient
    .from('decreto_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return;
  decreto_logs = (data || []).map(rowToLog);
  renderLogs();
}

function scheduleRefreshLogs() {
  clearTimeout(refreshLogsTimer);
  refreshLogsTimer = setTimeout(refreshLogsFromServer, 120);
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
      { event: '*', schema: 'public', table: 'decreto_logs' },
      () => scheduleRefreshLogs()
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
  clearTimeout(refreshLogsTimer);
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
  renderLogs();
  updateStats();

  if (showWelcomeToast) {
    showToast('Acceso concedido. Bienvenido/a, ' + profile.short + '.', 'success');
  }

  // Iniciar push notifications (no bloqueante)
  setupPushNotifications();
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
   WRITE LOG
───────────────────────────────────────────── */
async function writeLog(eventType, item) {
  if (!supabaseClient || !currentAuthId) return;
  const { data, error } = await supabaseClient
    .from('decreto_logs')
    .insert({
      decreto_id:       item.id || null,
      decreto_title:    item.title,
      decreto_type:     item.type,
      decreto_priority: item.priority,
      event_type:       eventType,
      actor_key:        currentUser,
      actor_id:         currentAuthId,
    })
    .select()
    .single();
  if (error) { console.error('[writeLog]', error); return; }
  decreto_logs.unshift(rowToLog(data));
  renderLogs();
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

  await Promise.all([
    writeLog('created', rowToItem(data)),
    addLogEntry(currentUser, `[DECRETO] "${title}" — ${TYPE_LABELS[type]}`),
  ]);
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
  await Promise.all([
    writeLog('approved', item),
    addLogEntry(currentUser, `[APROBADO] "${item.title}"`),
  ]);
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
  await Promise.all([
    writeLog('rejected', item),
    addLogEntry(currentUser, `[RECHAZADO] "${item.title}"`),
  ]);
  showToast('Decreto rechazado.', 'error');
}

async function deleteItem(id) {
  if (!confirm('¿Eliminar este asunto del registro oficial?')) return;
  if (!supabaseClient) return;

  const item = items.find(i => i.id === id);

  const { error } = await supabaseClient.from('decretos').delete().eq('id', id);
  if (error) {
    dbErrorToast(error, 'No se pudo eliminar');
    return;
  }

  if (item) await writeLog('deleted', item);
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
   HISTORIAL DE LOGS
───────────────────────────────────────────── */
const EVENT_META = {
  created:  { label: 'PRESENTADO',  badge: 'log-event--created',  icon: '📜' },
  approved: { label: 'APROBADO',    badge: 'log-event--approved', icon: '✅'  },
  rejected: { label: 'RECHAZADO',   badge: 'log-event--rejected', icon: '❌'  },
  deleted:  { label: 'ELIMINADO',   badge: 'log-event--deleted',  icon: '🗑️'  },
};

function setLogsFilter(filter, btn) {
  logsFilter = filter;
  logsPage   = 0;
  document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderLogs();
}

function logsChangePage(dir) {
  const filtered = logsFilter === 'all'
    ? decreto_logs
    : decreto_logs.filter(l => l.event_type === logsFilter);
  const maxPage = Math.max(0, Math.ceil(filtered.length / LOGS_PER_PAGE) - 1);
  logsPage = Math.min(maxPage, Math.max(0, logsPage + dir));
  renderLogs();
}

function renderLogs() {
  const container = document.getElementById('logsContainer');
  if (!container) return;

  const filtered = logsFilter === 'all'
    ? decreto_logs
    : decreto_logs.filter(l => l.event_type === logsFilter);

  // Pagination info
  const total    = filtered.length;
  const maxPage  = Math.max(0, Math.ceil(total / LOGS_PER_PAGE) - 1);
  logsPage       = Math.min(logsPage, maxPage);
  const start    = logsPage * LOGS_PER_PAGE;
  const page     = filtered.slice(start, start + LOGS_PER_PAGE);

  // Update counter badge
  const countEl = document.getElementById('logsTotalBadge');
  if (countEl) countEl.textContent = total + ' REGISTROS';

  // Pagination controls
  const prevBtn = document.getElementById('logsPrev');
  const nextBtn = document.getElementById('logsNext');
  const pageEl  = document.getElementById('logsPageInfo');
  if (prevBtn) prevBtn.disabled = logsPage === 0;
  if (nextBtn) nextBtn.disabled = logsPage >= maxPage;
  if (pageEl)  pageEl.textContent = total === 0 ? '—' : `${logsPage + 1} / ${maxPage + 1}`;

  if (page.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">No hay registros en esta categoría.</div>
      </div>`;
    return;
  }

  container.innerHTML = page.map(log => {
    const meta       = EVENT_META[log.event_type] || { label: log.event_type, badge: '', icon: '·' };
    const authorUser = USERS[log.actor_key];
    const authorName = authorUser ? authorUser.short : log.actor_key;
    const typeLabel  = TYPE_LABELS[log.decreto_type] || log.decreto_type;
    const prioLabel  = PRIORITY_LABELS[log.decreto_priority] || log.decreto_priority;

    return `
      <div class="log-record">
        <div class="log-record__left">
          <span class="log-event-badge ${meta.badge}">${meta.icon} ${meta.label}</span>
          <span class="log-record__ts">${log.ts}</span>
        </div>
        <div class="log-record__body">
          <div class="log-record__title">${escHtml(log.decreto_title)}</div>
          <div class="log-record__meta">
            ${typeLabel} &nbsp;·&nbsp; ${prioLabel} &nbsp;·&nbsp;
            <span class="log-record__actor">por ${escHtml(authorName)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
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
   PUSH NOTIFICATIONS
───────────────────────────────────────────── */

// Convierte una VAPID public key base64url → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function setupPushNotifications() {
  // Comprobar soporte del navegador
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push] No soportado en este navegador.');
    return;
  }

  if (VAPID_PUBLIC_KEY === 'TU_VAPID_PUBLIC_KEY_AQUI') {
    console.warn('[Push] VAPID_PUBLIC_KEY no configurada todavía.');
    return;
  }

  try {
    // Registrar service worker
    swRegistration = await navigator.serviceWorker.register('/service-worker.js');
    console.log('[Push] Service Worker registrado ✓');

    // Comprobar permiso actual
    const permission = Notification.permission;

    if (permission === 'denied') {
      console.log('[Push] Permiso denegado por el usuario.');
      return;
    }

    if (permission === 'default') {
      // Mostrar un toast amigable antes de pedir permiso
      showPushPrompt();
      return;
    }

    // permission === 'granted' → suscribir directamente
    await subscribeToPush();

  } catch (err) {
    console.error('[Push] Error en setup:', err);
  }
}

function showPushPrompt() {
  // Toast especial con botón para pedir permiso
  const c  = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className   = 'toast toast--push-prompt';
  el.style.cssText = 'max-width:320px; cursor:default;';
  el.innerHTML = `
    <div style="margin-bottom:.5rem; font-size:.8rem; letter-spacing:.06em;">
      🔔 ¿Activar notificaciones?
    </div>
    <div style="font-size:.72rem; opacity:.75; margin-bottom:.75rem; line-height:1.5;">
      Recibe un aviso cuando llegue un decreto o mensaje nuevo.
    </div>
    <div style="display:flex; gap:.5rem;">
      <button id="pushYes" style="
        flex:1; font-family:inherit; font-size:.7rem; letter-spacing:.1em;
        text-transform:uppercase; padding:.35rem; background:rgba(184,146,42,0.2);
        border:1px solid rgba(184,146,42,0.5); color:#D4A93A; cursor:pointer;">
        Activar
      </button>
      <button id="pushNo" style="
        flex:1; font-family:inherit; font-size:.7rem; letter-spacing:.1em;
        text-transform:uppercase; padding:.35rem; background:transparent;
        border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.4); cursor:pointer;">
        Ahora no
      </button>
    </div>`;

  c.appendChild(el);

  el.querySelector('#pushYes').addEventListener('click', async () => {
    el.remove();
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeToPush();
      showToast('Notificaciones activadas. ✓', 'success');
    }
  });

  el.querySelector('#pushNo').addEventListener('click', () => el.remove());
}

async function subscribeToPush() {
  if (!swRegistration) return;

  try {
    // Ver si ya hay una suscripción activa
    let subscription = await swRegistration.pushManager.getSubscription();

    if (!subscription) {
      // Crear nueva suscripción
      subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Guardar/actualizar en Supabase
    await savePushSubscription(subscription);
    console.log('[Push] Suscripción activa ✓');

  } catch (err) {
    console.error('[Push] Error al suscribir:', err);
  }
}

async function savePushSubscription(subscription) {
  if (!supabaseClient || !currentAuthId || !currentUser) return;

  const { endpoint, keys } = subscription.toJSON();

  const { error } = await supabaseClient
    .from('push_subscriptions')
    .upsert({
      user_id:    currentAuthId,
      user_key:   currentUser,          // 'presidente' | 'ministro'
      endpoint,
      p256dh:     keys.p256dh,
      auth:       keys.auth,
      user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'user_id' });     // sobreescribe si ya existe

  if (error) {
    console.error('[Push] Error guardando suscripción:', error);
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
