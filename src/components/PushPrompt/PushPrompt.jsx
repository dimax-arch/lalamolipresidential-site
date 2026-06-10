import styles from './PushPrompt.module.css';

export default function PushPrompt({ onEnable, onDismiss }) {
  return (
    <div className={styles.prompt}>
      <div className={styles.title}>🔔 ¿Activar notificaciones?</div>
      <div className={styles.text}>
        Recibe un aviso cuando llegue un decreto o mensaje nuevo.
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.yes} onClick={onEnable}>
          Activar
        </button>
        <button type="button" className={styles.no} onClick={onDismiss}>
          Ahora no
        </button>
      </div>
    </div>
  );
}
