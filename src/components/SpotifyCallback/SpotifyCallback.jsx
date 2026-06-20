import { useEffect, useState } from 'react';
import { exchangeCode } from '../../lib/spotify.js';
import styles from './SpotifyCallback.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

export default function SpotifyCallback() {
  const [status, setStatus] = useState('working'); // working | done | error
  const [message, setMessage] = useState('Conectando con Spotify…');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');

    if (oauthError) {
      setStatus('error');
      setMessage('Autorización cancelada en Spotify.');
      return;
    }
    if (!code) {
      setStatus('error');
      setMessage('No se recibió ningún código de Spotify.');
      return;
    }

    (async () => {
      try {
        await exchangeCode(code, state);
        setStatus('done');
        setMessage('Spotify conectado. Volviendo al Palacio…');
        setTimeout(() => window.location.replace('/'), 1200);
      } catch (err) {
        console.error('[Spotify callback]', err);
        setStatus('error');
        setMessage(err?.message || 'No se pudo completar la conexión con Spotify.');
      }
    })();
  }, []);

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <img className={styles.crown} src={crown} alt="" />
        <p className={styles.title}>Gabinete Presidencial</p>
        <p className={`${styles.message} ${status === 'error' ? styles.error : ''}`}>{message}</p>

        {status === 'working' && <div className={styles.spinner} />}

        {status === 'error' && (
          <button
            type="button"
            className="btn-decree"
            style={{ marginTop: '1.5rem', width: 'auto', padding: '0.6rem 1.5rem' }}
            onClick={() => window.location.replace('/')}
          >
            Volver al Palacio
          </button>
        )}
      </div>
    </div>
  );
}
