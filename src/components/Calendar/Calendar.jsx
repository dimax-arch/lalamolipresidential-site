import { useMemo, useState } from 'react';
import { PRIORITY_LABELS, TYPE_LABELS, USERS } from '../../lib/constants';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import styles from './Calendar.module.css';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STATUS_LABELS = {
  pending: 'Pendiente',
  approved: 'Aprobado ✓',
  rejected: 'Rechazado ✗',
};

function dateKey(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatSelectedDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Calendar({ items }) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedKey, setSelectedKey] = useState(todayKey);

  // Agrupa los decretos con fecha por día (los sin fecha no aparecen)
  const eventsByDate = useMemo(() => {
    const map = {};
    for (const item of items) {
      if (!item.date) continue;
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
    }
    return map;
  }, [items]);

  // Rejilla del mes: semanas de 7 celdas, rellenando con días vecinos
  const cells = useMemo(() => {
    const startOffset = new Date(year, month, 1).getDay(); // 0 = domingo
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const list = [];

    for (let i = startOffset; i > 0; i--) {
      const dt = new Date(year, month, 1 - i);
      list.push({
        day: dt.getDate(),
        key: dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate()),
        inMonth: false,
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ day: d, key: dateKey(year, month, d), inMonth: true });
    }
    let overflow = 1;
    while (list.length % 7 !== 0) {
      const dt = new Date(year, month + 1, overflow++);
      list.push({
        day: dt.getDate(),
        key: dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate()),
        inMonth: false,
      });
    }
    return list;
  }, [year, month]);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthCount = items.filter((i) => i.date && i.date.startsWith(monthPrefix)).length;

  function changeMonth(delta) {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  }

  function goToToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedKey(todayKey);
  }

  const selectedEvents = (selectedKey && eventsByDate[selectedKey]) || [];

  return (
    <Panel
      icon="📅"
      title="Calendario Oficial — Agenda del Gabinete"
      badge={<PanelBadge>{monthCount} EVENTOS</PanelBadge>}
      full
    >
      <div className={styles.toolbar}>
        <button
          type="button"
          className={`btn-small ${styles.navBtn}`}
          aria-label="Mes anterior"
          onClick={() => changeMonth(-1)}
        >
          ←
        </button>
        <div className={styles.monthLabel}>
          {MONTHS[month]} {year}
        </div>
        <button
          type="button"
          className={`btn-small ${styles.navBtn}`}
          aria-label="Mes siguiente"
          onClick={() => changeMonth(1)}
        >
          →
        </button>
        <button type="button" className={`btn-small ${styles.todayBtn}`} onClick={goToToday}>
          Hoy
        </button>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotPending}`} /> Pendiente
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotApproved}`} /> Aprobado
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.dot} ${styles.dotRejected}`} /> Rechazado
          </span>
        </div>
      </div>

      <div className={styles.grid}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday}>
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const events = eventsByDate[cell.key] || [];
          const cellClasses = [
            styles.cell,
            !cell.inMonth && styles.outside,
            cell.key === todayKey && styles.today,
            cell.key === selectedKey && styles.selected,
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              type="button"
              key={cell.key}
              className={cellClasses}
              onClick={() => setSelectedKey(cell.key)}
            >
              <span className={styles.dayNum}>
                {cell.day}
                {events.length > 0 && <span className={styles.countBubble}>{events.length}</span>}
              </span>
              <span className={styles.chips}>
                {events.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className={[styles.chip, styles['chip_' + ev.status]].filter(Boolean).join(' ')}
                    title={ev.title}
                  >
                    {ev.time && <span className={styles.chipTime}>{ev.time}</span>}
                    {ev.title}
                  </span>
                ))}
                {events.length > 3 && <span className={styles.more}>+{events.length - 3} más</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.detail}>
        <div className={styles.detailHeader}>
          {selectedKey ? formatSelectedDate(selectedKey) : '—'}
        </div>
        {selectedEvents.length === 0 ? (
          <div className={styles.detailEmpty}>Sin eventos programados para este día.</div>
        ) : (
          selectedEvents.map((ev) => {
            const author = USERS[ev.author];
            return (
              <div
                key={ev.id}
                className={[styles.eventRow, styles['row_' + ev.status]].filter(Boolean).join(' ')}
              >
                <div className={styles.eventTime}>{ev.time || 'Todo el día'}</div>
                <div className={styles.eventBody}>
                  <div className={styles.eventTitle}>{ev.title}</div>
                  <div className={styles.eventMeta}>
                    {TYPE_LABELS[ev.type] || ev.type} &nbsp;·&nbsp;{' '}
                    {PRIORITY_LABELS[ev.priority] || ev.priority} &nbsp;·&nbsp; por{' '}
                    {author ? author.short : ev.author}
                  </div>
                </div>
                <span className={`status-badge status-badge--${ev.status}`}>
                  {STATUS_LABELS[ev.status] || ev.status}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}
