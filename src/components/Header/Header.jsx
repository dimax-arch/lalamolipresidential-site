import { useAuth } from '../../context/AuthContext.jsx';
import styles from './Header.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

export default function Header() {
  const { profile, logout } = useAuth();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.escudo}>
          <img src={crown} alt="Corona de laureles" width="62" height="62" />
        </div>
        <div className={styles.text}>
          <div className={styles.eyebrow}>Documento Clasificado — Uso Interno</div>
          <h1 className={styles.title}>Gestión Presidencial</h1>
          <div className={styles.decree}>Sala de Operaciones y Coordinación Estratégica</div>
        </div>
        <div className={styles.session}>
          <div className={styles.dot} />
          <span className={styles.sessionLabel}>{profile?.label || '—'}</span>
          <button className={styles.logout} onClick={logout}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
