import { createContext, useCallback, useContext, useState } from 'react';
import styles from '../components/Toast/Toast.module.css';

const ToastContext = createContext(() => {});

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((msg, type) => {
    const id = ++counter;
    setToasts((prev) => [...prev, { id, msg, type, leaving: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 320);
    }, 2800);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className={styles.container}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              styles.toast,
              t.type === 'error' && styles.error,
              t.type === 'success' && styles.success,
              t.leaving && styles.leaving,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
