import { useAuth } from '../../context/AuthContext.jsx';
import ThemeToggle from '../ThemeToggle/ThemeToggle.jsx';
import styles from './Header.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

export default function Header() {
  const { profile, logout } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.escudo}>
        <img src={crown} alt="Corona de laureles" width="30" height="30" />
      </div>
      <div className={styles.text}>
        <span className={styles.title}>Gestión Presidencial</span>
        <span className={styles.divider} />
        <span className={styles.subtitle}>Sala de Operaciones y Coordinación Estratégica</span>
      </div>
      <div className={styles.session}>
        <ThemeToggle />
        <span className={styles.rolePill}>
          <span className={styles.dot} />
          <span className={styles.roleLabel}>{profile?.short || '—'}</span>
        </span>
        <button className={styles.logout} onClick={logout}>
          Salir
        </button>
      </div>
    </header>
  );
}
