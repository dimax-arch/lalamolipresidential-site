import styles from './Panel.module.css';

// Panel base del rediseño: cabecera con chip de ícono + título + badge,
// y una zona opcional de acciones alineada a la derecha (navegación,
// estadísticas, indicadores). `flush` quita el padding del cuerpo para
// paneles que manejan su propio layout interno (p. ej. el chat).
export default function Panel({ icon, title, badge, actions, full, flush, children }) {
  return (
    <section className={[styles.panel, full && styles.full].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        {icon && <span className={styles.iconChip}>{icon}</span>}
        <span className={styles.title}>{title}</span>
        {badge}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      <div className={flush ? styles.bodyFlush : styles.body}>{children}</div>
    </section>
  );
}

const BADGE_TONES = {
  neutral: styles.badgeNeutral,
  pending: styles.badgePending,
  approved: styles.badgeApproved,
};

export function PanelBadge({ children, tone = 'neutral', green }) {
  // `green` se mantiene por compatibilidad con llamadas antiguas.
  const toneClass = BADGE_TONES[green ? 'approved' : tone] || BADGE_TONES.neutral;
  return <span className={`${styles.badge} ${toneClass}`}>{children}</span>;
}
