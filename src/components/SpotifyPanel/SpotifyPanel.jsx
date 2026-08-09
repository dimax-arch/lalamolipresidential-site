import { useEffect, useState } from 'react';
import { useSpotify } from '../../hooks/useSpotify.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { USERS } from '../../lib/constants';
import Icon from '../Icons/Icons.jsx';
import styles from './SpotifyPanel.module.css';

const STALE_MS = 35000;
const ORDER = ['presidente', 'ministro'];

function fmtTime(ms) {
  if (!ms || ms < 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function MemberCard({
  memberKey,
  data,
  isSelf,
  selfConnected,
  selfSource,
  configured,
  onConnect,
  onDisconnect,
  clock,
}) {
  const user = USERS[memberKey];
  const name = user ? user.short : memberKey;
  const roleClass = memberKey === 'presidente' ? styles.president : styles.minister;

  const updatedAtMs = data?.updatedAt ? new Date(data.updatedAt).getTime() : 0;
  const stale = !updatedAtMs || clock - updatedAtMs > STALE_MS;
  const playing = Boolean(data?.isPlaying) && !stale && Boolean(data?.trackName);
  const showConnect = isSelf && !selfConnected;

  const duration = data?.durationMs ?? 0;
  let progress = data?.progressMs ?? 0;
  if (playing && updatedAtMs) {
    progress = (data.progressMs ?? 0) + (clock - updatedAtMs);
    if (duration > 0) progress = Math.min(duration, progress);
  }
  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  let stateLabel = 'En silencio';
  if (playing) stateLabel = 'En vivo';
  else if (showConnect) stateLabel = 'Sin conectar';
  else if (stale) stateLabel = 'Desconectado';

  return (
    <div className={[styles.card, playing && styles.cardPlaying].filter(Boolean).join(' ')}>
      <div className={styles.cardHead}>
        <span className={`${styles.member} ${roleClass}`}>{name}</span>
        <span className={styles.state}>
          {playing ? (
            // Ecualizador animado, el indicador clásico de Spotify
            <span className={styles.eq} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className={styles.dot} />
          )}
          {stateLabel}
        </span>
      </div>

      {showConnect ? (
        <div className={styles.idle}>
          {configured ? (
            <div className={styles.connectBox}>
              <p className={styles.idleText}>Conecta tu cuenta para compartir lo que escuchas.</p>
              <button type="button" className={styles.connectBtn} onClick={onConnect}>
                <Icon name="spotify" size={14} /> Conectar Spotify
              </button>
            </div>
          ) : (
            <span className={styles.idleText}>Falta configurar VITE_SPOTIFY_CLIENT_ID.</span>
          )}
        </div>
      ) : playing ? (
        <>
          <div className={styles.track}>
            {data.albumArtUrl ? (
              <img className={styles.art} src={data.albumArtUrl} alt="" />
            ) : (
              <div className={styles.artPlaceholder}>
                <Icon name="music" size={18} />
              </div>
            )}
            <div className={styles.meta}>
              <div className={styles.trackName} title={data.trackName}>
                {data.trackName}
              </div>
              <div className={styles.artist} title={data.artistName || ''}>
                {data.artistName}
              </div>
              {data.trackUrl && (
                <a
                  className={styles.link}
                  href={data.trackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir en Spotify ▶
                </a>
              )}
            </div>
          </div>
          <div className={styles.progress}>
            <div className={styles.bar}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.times}>
              <span>{fmtTime(progress)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.idle}>
          <span className={styles.idleText}>
            {stale ? 'No está en Spotify por ahora.' : 'Nada sonando.'}
          </span>
        </div>
      )}

      {isSelf && selfConnected && selfSource !== 'provider' && (
        <div className={styles.selfActions}>
          <button type="button" className={styles.disconnect} onClick={onDisconnect}>
            Desconectar Spotify
          </button>
        </div>
      )}
    </div>
  );
}

export default function SpotifyPanel() {
  const { configured, connected, connect, disconnect, nowPlaying, tokenSource } = useSpotify();
  const { userKey } = useAuth();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Contenedor propio (no el Panel compartido): la card lleva el look de
  // Spotify — negro #121212 + verde #1DB954, o su variante blanca en el
  // tema claro — con el logo real de la marca en la cabecera.
  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.logo}>
          <Icon name="spotify" size={20} />
        </span>
        <span className={styles.title}>Sala de escucha</span>
      </div>
      <div className={styles.grid}>
        {ORDER.map((key) => (
          <MemberCard
            key={key}
            memberKey={key}
            data={nowPlaying[key]}
            isSelf={key === userKey}
            selfConnected={connected}
            selfSource={tokenSource}
            configured={configured}
            onConnect={connect}
            onDisconnect={disconnect}
            clock={clock}
          />
        ))}
      </div>
    </section>
  );
}
