import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import {
  EVENT_META,
  LOGS_PER_PAGE,
  PRIORITY_LABELS,
  TYPE_LABELS,
  USERS,
} from '../../lib/constants';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import styles from './Agenda.module.css';

const ITEM_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'rejected', label: 'Rechazados' },
];

const LOG_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'created', label: '📜 Presentados' },
  { key: 'approved', label: '✓ Aprobados' },
  { key: 'rejected', label: '✗ Rechazados' },
  { key: 'deleted', label: '✕ Eliminados' },
];

const STATUS_BADGE = {
  pending: { cls: 'status-badge--pending', label: 'Pendiente' },
  approved: { cls: 'status-badge--approved', label: 'Aprobado ✓' },
  rejected: { cls: 'status-badge--rejected', label: 'Rechazado ✗' },
};

export default function Agenda({ items, logs, onApprove, onReject, onDelete }) {
  const { userKey } = useAuth();
  const confirm = useConfirm();

  const [activeFilter, setActiveFilter] = useState('all');
  const [logsFilter, setLogsFilter] = useState('all');
  const [logsPage, setLogsPage] = useState(0);

  const pending = items.filter((i) => i.status === 'pending').length;
  const approved = items.filter((i) => i.status === 'approved').length;

  const visible = activeFilter === 'all' ? items : items.filter((i) => i.status === activeFilter);

  const handleReject = async (item) => {
    if (await confirm(item, 'reject')) onReject(item);
  };
  const handleDelete = async (item) => {
    if (await confirm(item, 'delete')) onDelete(item);
  };

  // ── Logs ──
  const filteredLogs =
    logsFilter === 'all' ? logs : logs.filter((l) => l.event_type === logsFilter);
  const total = filteredLogs.length;
  const maxPage = Math.max(0, Math.ceil(total / LOGS_PER_PAGE) - 1);
  const page = Math.min(logsPage, maxPage);
  const pageLogs = filteredLogs.slice(page * LOGS_PER_PAGE, page * LOGS_PER_PAGE + LOGS_PER_PAGE);

  const changeLogsFilter = (key) => {
    setLogsFilter(key);
    setLogsPage(0);
  };

  return (
    <Panel
      icon="🗂"
      title="Agenda Oficial — Asuntos Pendientes"
      badge={<PanelBadge>{pending} PENDIENTES</PanelBadge>}
      full
    >
      <div className={styles.statsRow}>
        <Stat num={items.length} label="Total" />
        <Stat num={pending} label="Pendientes" />
        <Stat num={approved} label="Aprobados" />
      </div>

      <div className={styles.filterBar}>
        {ITEM_FILTERS.map((f) => (
          <button
            key={f.key}
            className={[styles.filterBtn, activeFilter === f.key && styles.filterActive]
              .filter(Boolean)
              .join(' ')}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.itemList}>
        {visible.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏛</div>
            <div className="empty-text">No hay asuntos en esta categoría.</div>
          </div>
        ) : (
          visible.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              userKey={userKey}
              onApprove={() => onApprove(item)}
              onReject={() => handleReject(item)}
              onDelete={() => handleDelete(item)}
            />
          ))
        )}
      </div>

      {/* ─── Historial ─── */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <div className={styles.logsTitle}>
            <span>📋</span>
            <span>Historial Oficial de Decretos</span>
          </div>
          <PanelBadge>{total} REGISTROS</PanelBadge>
        </div>

        <div className={styles.filterBar} style={{ marginBottom: '0.75rem' }}>
          {LOG_FILTERS.map((f) => (
            <button
              key={f.key}
              className={[styles.filterBtn, logsFilter === f.key && styles.filterActive]
                .filter(Boolean)
                .join(' ')}
              onClick={() => changeLogsFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {pageLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-text">No hay registros en esta categoría.</div>
          </div>
        ) : (
          pageLogs.map((log) => <LogRecord key={log.id} log={log} />)
        )}

        <div className={styles.pagination}>
          <button
            className="btn-small btn-small--delete"
            disabled={page === 0}
            onClick={() => setLogsPage((p) => Math.max(0, p - 1))}
          >
            ← Anterior
          </button>
          <span className={styles.pageInfo}>{total === 0 ? '—' : `${page + 1} / ${maxPage + 1}`}</span>
          <button
            className="btn-small btn-small--delete"
            disabled={page >= maxPage}
            onClick={() => setLogsPage((p) => Math.min(maxPage, p + 1))}
          >
            Siguiente →
          </button>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ num, label }) {
  return (
    <div className={styles.statBox}>
      <span className={styles.statNum}>{num}</span>
      <span className={styles.statLbl}>{label}</span>
    </div>
  );
}

function ItemCard({ item, userKey, onApprove, onReject, onDelete }) {
  const authorUser = USERS[item.author];

  const borderClass =
    item.status === 'approved' ? styles.green : item.status === 'rejected' ? styles.red : '';
  const dimClass = item.status !== 'pending' ? styles.dimmed : '';

  const badge = STATUS_BADGE[item.status];

  const dateStr = item.date ? ` — ${item.date}${item.time ? ' ' + item.time : ''}` : '';

  const canAct = item.status === 'pending';
  const isOwnItem = item.author === userKey;
  const canApprove = canAct && !isOwnItem;
  const canReject = canAct;
  const canDelete = !canAct || isOwnItem;

  return (
    <div className={[styles.itemCard, borderClass, dimClass].filter(Boolean).join(' ')}>
      <div className={styles.itemTop}>
        <div>
          <div className={styles.itemMeta}>
            {TYPE_LABELS[item.type] || item.type} &nbsp;·&nbsp;{' '}
            {PRIORITY_LABELS[item.priority] || item.priority}
            {dateStr}
          </div>
          <div className={styles.itemTitle}>{item.title}</div>
        </div>
        {badge && <span className={`status-badge ${badge.cls}`}>{badge.label}</span>}
      </div>

      {item.desc && <div className={styles.itemDesc}>{item.desc}</div>}

      <div className={styles.itemMeta} style={{ marginTop: '0.45rem' }}>
        Propuesto por: {authorUser ? authorUser.short : item.author} · {item.created}
      </div>

      <div className={styles.itemActions}>
        {canApprove && (
          <button type="button" className="btn-small btn-small--approve" onClick={onApprove}>
            ✓ Aprobar
          </button>
        )}
        {canReject && (
          <button type="button" className="btn-small btn-small--reject" onClick={onReject}>
            ✗ Rechazar
          </button>
        )}
        {canDelete && (
          <button type="button" className="btn-small btn-small--delete" onClick={onDelete}>
            ✕ Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

function LogRecord({ log }) {
  const meta = EVENT_META[log.event_type] || { label: log.event_type, badge: '', icon: '·' };
  const authorUser = USERS[log.actor_key];
  const authorName = authorUser ? authorUser.short : log.actor_key;
  const typeLabel = TYPE_LABELS[log.decreto_type] || log.decreto_type;
  const prioLabel = PRIORITY_LABELS[log.decreto_priority] || log.decreto_priority;

  return (
    <div className={styles.logRecord}>
      <div className={styles.logLeft}>
        <span className={[styles.logEventBadge, styles[meta.badge]].filter(Boolean).join(' ')}>
          {meta.icon} {meta.label}
        </span>
        <span className={styles.logTs}>{log.ts}</span>
      </div>
      <div className={styles.logBody}>
        <div className={styles.logTitle}>{log.decreto_title}</div>
        <div className={styles.logMeta}>
          {typeLabel} &nbsp;·&nbsp; {prioLabel} &nbsp;·&nbsp;{' '}
          <span className={styles.logActor}>por {authorName}</span>
        </div>
      </div>
    </div>
  );
}
