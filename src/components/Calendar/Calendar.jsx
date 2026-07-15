import { useMemo, useState } from 'react';
import { PRIORITY_LABELS, TYPE_LABELS, USERS } from '../../lib/constants';
import { useGoogleCalendar } from '../../hooks/useGoogleCalendar.js';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import Icon from '../Icons/Icons.jsx';
import styles from './Calendar.module.css';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const STATUS_LABELS = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
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
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default function Calendar({ items }) {
  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedKey, setSelectedKey] = useState(todayKey);

  // Google Calendar del usuario (solo lectura, opcional)
  const google = useGoogleCalendar(year, month);

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

  // Eventos de Google agrupados por día (los de día completo primero)
  const googleByDate = useMemo(() => {
    const map = {};
    for (const ev of google.events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
    }
    return map;
  }, [google.events]);

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
  const selectedGoogle = (selectedKey && googleByDate[selectedKey]) || [];

  const toolbar = (
    <>
      <button
        type="button"
        className={styles.navBtn}
        aria-label="Mes anterior"
        onClick={() => changeMonth(-1)}
      >
        <Icon name="chevronLeft" size={13} />
      </button>
      <span className={styles.monthLabel}>
        {MONTHS[month]} {year}
      </span>
      <button
        type="button"
        className={styles.navBtn}
        aria-label="Mes siguiente"
        onClick={() => changeMonth(1)}
      >
        <Icon name="chevronRight" size={13} />
      </button>
      <button type="button" className={styles.todayBtn} onClick={goToToday}>
        Hoy
      </button>
      <span className={styles.sep} />
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.dotPending}`} /> Pendiente
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.dotApproved}`} /> Aprobado
      </span>
      <span className={styles.legendItem}>
        <span className={`${styles.legendDot} ${styles.dotRejected}`} /> Rechazado
      </span>
      <span className={styles.sep} />
      {google.connected ? (
        <>
          <span className={styles.legendItem}>
            <span className={`${styles.legendDot} ${styles.dotGoogle}`} /> Google
          </span>
          <button
            type="button"
            className={styles.todayBtn}
            title="Desconectar Google Calendar de este dispositivo"
            onClick={google.disconnect}
          >
            Google ✓
          </button>
        </>
      ) : (
        <button
          type="button"
          className={styles.todayBtn}
          title="Mostrar aquí los eventos de tu Google Calendar"
          onClick={google.connect}
        >
          Conectar Google
        </button>
      )}
    </>
  );

  return (
    <Panel
      icon={<Icon name="calendar" />}
      title="Calendario oficial"
      badge={<PanelBadge>{monthCount} eventos este mes</PanelBadge>}
      actions={toolbar}
      full
    >
      <div className={styles.weekdays}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={styles.weekday}>
            {d}
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {cells.map((cell) => {
          const events = eventsByDate[cell.key] || [];
          const gEvents = googleByDate[cell.key] || [];
          // Chips combinados: decretos primero, luego Google
          const chips = [
            ...events.map((ev) => ({
              key: ev.id,
              className: styles['chip_' + ev.status],
              time: ev.time,
              title: ev.title,
            })),
            ...gEvents.map((ev) => ({
              key: 'g_' + ev.id,
              className: styles.chip_google,
              time: ev.time,
              title: ev.title,
            })),
          ];
          const isToday = cell.key === todayKey;
          const cellClasses = [
            styles.cell,
            !cell.inMonth && styles.outside,
            isToday && styles.today,
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
                <span>{cell.day}</span>
                {chips.length > 0 && <span className={styles.countBubble}>{chips.length}</span>}
                {isToday && <span className={styles.todayDot} />}
              </span>
              <span className={styles.chips}>
                {chips.slice(0, 3).map((chip) => (
                  <span
                    key={chip.key}
                    className={[styles.chip, chip.className].filter(Boolean).join(' ')}
                    title={chip.title}
                  >
                    {chip.time && <b className={styles.chipTime}>{chip.time}</b>}
                    {chip.title}
                  </span>
                ))}
                {chips.length > 3 && <span className={styles.more}>+{chips.length - 3} más</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.detail}>
        <span className={styles.detailHeader}>
          {selectedKey ? formatSelectedDate(selectedKey) : '—'}
        </span>
        <div className={styles.detailBody}>
          {selectedEvents.length === 0 && selectedGoogle.length === 0 ? (
            <div className={styles.detailEmpty}>Sin eventos programados para este día.</div>
          ) : (
            selectedEvents.map((ev) => {
              const author = USERS[ev.author];
              return (
                <div key={ev.id} className={styles.eventRow}>
                  <span className={styles.eventTime}>{ev.time || 'Todo el día'}</span>
                  <span className={`${styles.eventBar} ${styles['bar_' + ev.status] || ''}`} />
                  <span className={styles.eventTitle}>{ev.title}</span>
                  <span className={styles.eventMeta}>
                    {TYPE_LABELS[ev.type] || ev.type} · {PRIORITY_LABELS[ev.priority] || ev.priority}{' '}
                    · por {author ? author.short : ev.author}
                  </span>
                  <span className={`status-badge status-badge--${ev.status} ${styles.eventBadge}`}>
                    {STATUS_LABELS[ev.status] || ev.status}
                  </span>
                </div>
              );
            })
          )}
          {selectedGoogle.map((ev) => (
            <div key={ev.id} className={styles.eventRow}>
              <span className={styles.eventTime}>{ev.time || 'Todo el día'}</span>
              <span className={`${styles.eventBar} ${styles.bar_google}`} />
              {ev.link ? (
                <a
                  className={`${styles.eventTitle} ${styles.eventLink}`}
                  href={ev.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {ev.title}
                </a>
              ) : (
                <span className={styles.eventTitle}>{ev.title}</span>
              )}
              <span className={styles.eventMeta}>Google Calendar</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
