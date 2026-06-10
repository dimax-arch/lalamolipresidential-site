import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { USERS } from '../../lib/constants';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import styles from './MessagePanel.module.css';

export default function MessagePanel({ messages, onSend }) {
  const { userKey } = useAuth();
  const [text, setText] = useState('');
  const [showBadge, setShowBadge] = useState(false);
  const areaRef = useRef(null);
  const lastSeenRef = useRef(messages.length);
  const badgeTimer = useRef(null);

  useEffect(() => {
    const area = areaRef.current;
    if (area) area.scrollTop = area.scrollHeight;

    const last = messages[messages.length - 1];
    const incomingFromOther = last && last.userKey !== userKey;

    if (incomingFromOther && messages.length > lastSeenRef.current) {
      setShowBadge(true);
      clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => {
        setShowBadge(false);
        lastSeenRef.current = messages.length;
      }, 3000);
    } else if (!incomingFromOther) {
      // Mensaje propio: lo damos por visto.
      lastSeenRef.current = messages.length;
    }
  }, [messages, userKey]);

  useEffect(() => () => clearTimeout(badgeTimer.current), []);

  function handleSend() {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  }

  const badge = showBadge ? <PanelBadge>NUEVO</PanelBadge> : null;

  return (
    <Panel icon="📡" title="Línea Directa — Canal Seguro" badge={badge}>
      <div className={styles.logArea} ref={areaRef}>
        {messages.length === 0 ? (
          <div className={styles.entry}>
            <span className={styles.ts}>──</span>
            <span className={`${styles.msg} ${styles.system}`}>
              Canal de comunicación activo. Bienvenido/a al Palacio.
            </span>
          </div>
        ) : (
          messages.map((m) => {
            const user = USERS[m.userKey];
            const roleClass = user ? styles[user.logClass] : '';
            const roleName = user ? user.short.toUpperCase() : m.userKey.toUpperCase();
            return (
              <div className={styles.entry} key={m.id}>
                <span className={styles.ts}>[{m.ts}]</span>
                <span className={`${styles.role} ${roleClass}`}>{roleName}:</span>
                <span className={styles.msg}>{m.text}</span>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.inputRow}>
        <input
          className="form-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Transmitir mensaje cifrado…"
          maxLength={300}
        />
        <button className="btn-decree btn-send" type="button" onClick={handleSend}>
          Enviar ▶
        </button>
      </div>
    </Panel>
  );
}
