import styles from './Panel.module.css';

export default function Panel({ icon, title, badge, full, children }) {
  return (
    <section className={[styles.panel, full && styles.full].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.title}>{title}</span>
        {badge}
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export function PanelBadge({ children, green }) {
  return (
    <span className={[styles.badge, green && styles.badgeGreen].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
