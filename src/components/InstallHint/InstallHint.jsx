import { useEffect, useState } from 'react';
import styles from './InstallHint.module.css';

const DISMISS_KEY = 'ios_install_hint_dismissed';

function isIos() {
  const ua = navigator.userAgent;
  const iOSDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS se reporta como Mac con pantalla táctil.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

// "Agregar a inicio" solo funciona en Safari de iOS, no en Chrome/Firefox/Edge.
function isIosSafari() {
  return isIos() && !/crios|fxios|edgios/i.test(navigator.userAgent);
}

export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    if (isIosSafari() && !isStandalone()) setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  return (
    <div className={styles.bar} role="dialog" aria-label="Instalar la aplicación">
      <div className={styles.text}>
        Instala el Palacio en tu iPhone: toca <span className={styles.share}>Compartir ↑</span> y
        luego <strong>“Agregar a inicio”</strong>.
      </div>
      <button type="button" className={styles.close} onClick={dismiss} aria-label="Cerrar aviso">
        ✕
      </button>
    </div>
  );
}
