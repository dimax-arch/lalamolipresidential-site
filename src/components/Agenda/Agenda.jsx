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
import Icon from '../Icons/Icons.jsx';
import styles from './Agenda.module.css';

const ITEM_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendientes' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'rejected', label: 'Rechazados' },
];

const LOG_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'created', label: 'Presentados' },
  { key: 'approved', label: 'Aprobados' },
  { key: 'rejected', label: 'Rechazados' },
  { key: 'deleted', label: 'Eliminados' },
];

const STATUS_BADGE = {
  pending: { cls: 'status-badge--pending', label: 'Pendiente' },
  approved: { cls: 'status-badge--approved', label: 'Aprobado' },
  rejected: { cls: 'status-badge--rejected', label: 'Rechazado' },
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

  const stats = (
    <div className={styles.stats}>
      <Stat num={items.length} label="Total" />
      <Stat num={pending} label="Pendientes" tone={styles.statPending} />
      <Stat num={approved} label="Aprobados" tone={styles.statApproved} />
    </div>
  );

  return (
    <Panel
      icon={<Icon name="archive" />}
      title="Agenda oficial"
      badge={<PanelBadge tone="pending">{pending} pendientes</PanelBadge>}
      actions={stats}
      full
      flush
    >
      <div className={styles.columns}>
        {/* ─── Asuntos ─── */}
        <div className={styles.itemsCol}>
          <div className={styles.segTrack}>
            {ITEM_FILTERS.map((f) => (
              <button
                key={f.key}
                className={[styles.segBtn, activeFilter === f.key && styles.segActive]
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
        </div>

        {/* ─── Historial ─── */}
        <div className={styles.logsCol}>
          <div className={styles.logsHeader}>
            <span className={styles.logsTitle}>Historial de decretos</span>
            <PanelBadge>{total}</PanelBadge>
          </div>

          <div className={styles.logFilters}>
            {LOG_FILTERS.map((f) => (
              <button
                key={f.key}
                className={[styles.logFilterBtn, logsFilter === f.key && styles.logFilterActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => changeLogsFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className={styles.logList}>
            {pageLogs.length === 0 ? (
              <div className="empty-state">
                <div className="empty-text">No hay registros en esta categoría.</div>
              </div>
            ) : (
              pageLogs.map((log) => <LogRecord key={log.id} log={log} />)
            )}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>
              {total === 0 ? '—' : `${page + 1} / ${maxPage + 1}`}
            </span>
            <div className={styles.pageBtns}>
              <button
                className={styles.pageBtn}
                aria-label="Página anterior"
                disabled={page === 0}
                onClick={() => setLogsPage((p) => Math.max(0, p - 1))}
              >
                <Icon name="chevronLeft" size={12} />
              </button>
              <button
                className={styles.pageBtn}
                aria-label="Página siguiente"
                disabled={page >= maxPage}
                onClick={() => setLogsPage((p) => Math.min(maxPage, p + 1))}
              >
                <Icon name="chevronRight" size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ num, label, tone }) {
  return (
    <span className={styles.statBox}>
      <span className={[styles.statNum, tone].filter(Boolean).join(' ')}>{num}</span>
      <span className={styles.statLbl}>{label}</span>
    </span>
  );
}

function ItemCard({ item, userKey, onApprove, onReject, onDelete }) {
  const authorUser = USERS[item.author];

  const badge = STATUS_BADGE[item.status];
  const dimClass = item.status !== 'pending' ? styles.dimmed : '';

  const dateStr = item.date ? `${item.date}${item.time ? ' ' + item.time : ''}` : '';

  const canAct = item.status === 'pending';
  const isOwnItem = item.author === userKey;
  const canApprove = canAct && !isOwnItem;
  const canReject = canAct;
  const canDelete = !canAct || isOwnItem;

  return (
    <div className={[styles.itemCard, dimClass].filter(Boolean).join(' ')}>
      <span className={`${styles.itemBar} ${styles['bar_' + item.status] || ''}`} />
      <div className={styles.itemBody}>
        <div className={styles.itemTop}>
          <div className={styles.itemTitle}>{item.title}</div>
          {badge && <span className={`status-badge ${badge.cls}`}>{badge.label}</span>}
        </div>

        <div className={styles.itemMeta}>
          <span className={styles.itemType}>{TYPE_LABELS[item.type] || item.type}</span>
          <span>·</span>
          <span className={styles.itemPrio}>
            <span className={styles.prioDot} data-prio={item.priority} />
            {PRIORITY_LABELS[item.priority] || item.priority}
          </span>
          {dateStr && (
            <>
              <span>·</span>
              <span>{dateStr}</span>
            </>
          )}
          <span>·</span>
          <span>por {authorUser ? authorUser.short : item.author}</span>
        </div>

        {item.desc && <div className={styles.itemDesc}>{item.desc}</div>}

        <div className={styles.itemActions}>
          {canApprove && (
            <button type="button" className="btn-small btn-small--approve" onClick={onApprove}>
              <Icon name="check" size={11} strokeWidth={2.5} />
              Aprobar
            </button>
          )}
          {canReject && (
            <button type="button" className="btn-small btn-small--reject" onClick={onReject}>
              <Icon name="x" size={11} strokeWidth={2.5} />
              Rechazar
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn-small btn-small--delete" onClick={onDelete}>
              <Icon name="trash" size={11} />
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LogRecord({ log }) {
  const meta = EVENT_META[log.event_type] || { label: log.event_type, badge: '' };
  const authorUser = USERS[log.actor_key];
  const authorName = authorUser ? authorUser.short : log.actor_key;
  const typeLabel = TYPE_LABELS[log.decreto_type] || log.decreto_type;
  const prioLabel = PRIORITY_LABELS[log.decreto_priority] || log.decreto_priority;

  return (
    <div className={styles.logRecord}>
      <span className={[styles.logDot, styles['ev_' + log.event_type]].filter(Boolean).join(' ')} />
      <div className={styles.logBody}>
        <div className={styles.logTop}>
          <span
            className={[styles.logLabel, styles['ev_' + log.event_type]].filter(Boolean).join(' ')}
          >
            {meta.label}
          </span>
          <span className={styles.logTs}>{log.ts}</span>
        </div>
        <div className={styles.logTitle}>{log.decreto_title}</div>
        <div className={styles.logMeta}>
          {typeLabel} · {prioLabel} · por {authorName}
        </div>
      </div>
    </div>
  );
}
