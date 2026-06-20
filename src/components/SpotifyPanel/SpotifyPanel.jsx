import { useEffect, useState } from 'react';
import { useSpotify } from '../../hooks/useSpotify.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { USERS } from '../../lib/constants';
import Panel from '../Panel/Panel.jsx';
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

function MemberCard({ memberKey, data, isSelf, selfConnected, configured, onConnect, onDisconnect, clock }) {
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
          <span className={[styles.dot, playing && styles.dotLive].filter(Boolean).join(' ')} />
          {stateLabel}
        </span>
      </div>

      {showConnect ? (
        <div className={styles.idle}>
          {configured ? (
            <div>
              <p className={styles.idleText}>Conecta tu cuenta para compartir lo que escuchas.</p>
              <button type="button" className={`btn-decree ${styles.connectBtn}`} onClick={onConnect}>
                Conectar Spotify
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
              <div className={styles.artPlaceholder}>🎵</div>
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
            {stale ? 'No está en el Palacio ahora.' : 'Nada sonando.'}
          </span>
        </div>
      )}

      {isSelf && selfConnected && (
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
  const { configured, connected, connect, disconnect, nowPlaying } = useSpotify();
  const { userKey } = useAuth();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Panel icon="🎧" title="Sala de Escucha — Spotify" full>
      <div className={styles.grid}>
        {ORDER.map((key) => (
          <MemberCard
            key={key}
            memberKey={key}
            data={nowPlaying[key]}
            isSelf={key === userKey}
            selfConnected={connected}
            configured={configured}
            onConnect={connect}
            onDisconnect={disconnect}
            clock={clock}
          />
        ))}
      </div>
    </Panel>
  );
}
