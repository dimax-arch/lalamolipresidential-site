import { useEffect, useRef, useState } from 'react';
import { CONFIRM_COPY, PRIORITY_LABELS, TYPE_LABELS } from '../../lib/constants';
import styles from './ConfirmModal.module.css';

export default function ConfirmModal({ state, onClose }) {
  const { open, item, action } = state;
  const cancelRef = useRef(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => cancelRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const copy = CONFIRM_COPY[action] || CONFIRM_COPY.delete;

  const meta = item?.meta
    ? item.meta
    : item
      ? (() => {
          const typeLabel = TYPE_LABELS[item.type] || item.type;
          const prioLabel = PRIORITY_LABELS[item.priority] || item.priority;
          const dateStr = item.date ? ` · ${item.date}` : '';
          return `${typeLabel} · ${prioLabel}${dateStr}`;
        })()
      : '';

  const triggerShake = () => {
    setShake(false);
    requestAnimationFrame(() => setShake(true));
  };

  return (
    <div
      className={[styles.backdrop, open && styles.visible].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerShake();
      }}
    >
      <div
        className={[styles.card, shake && styles.shake].filter(Boolean).join(' ')}
        onAnimationEnd={() => setShake(false)}
      >
        <div className={styles.header}>
          <div className={styles.headerIcon}>⚠</div>
          <div className={styles.headerText}>
            <div className={styles.eyebrow}>{copy.eyebrow}</div>
            <div className={styles.title}>{copy.title}</div>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.decreeCard}>
            <div className={styles.decreeTitle}>{item?.title || '—'}</div>
            <div className={styles.decreeMeta}>{meta || '—'}</div>
          </div>
          <p className={styles.warning}>{copy.warning}</p>
        </div>

        <div className={styles.footer}>
          <button
            ref={cancelRef}
            type="button"
            className={`${styles.btn} ${styles.cancel}`}
            onClick={() => onClose(false)}
          >
            ← Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles[copy.actionClass]}`}
            onClick={() => onClose(true)}
          >
            {copy.actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
