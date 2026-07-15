import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { USERS } from '../../lib/constants';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import Icon from '../Icons/Icons.jsx';
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

  const badge = showBadge ? <PanelBadge tone="pending">Nuevo</PanelBadge> : null;

  const live = (
    <span className={styles.live}>
      <span className={styles.liveDot} />
      Canal seguro
    </span>
  );

  return (
    <Panel icon={<Icon name="chat" />} title="Línea directa" badge={badge} actions={live} flush>
      <div className={styles.logArea} ref={areaRef}>
        {messages.length === 0 ? (
          <div className={styles.system}>Canal de comunicación activo. Bienvenido/a al Palacio.</div>
        ) : (
          messages.map((m) => {
            const user = USERS[m.userKey];
            const mine = m.userKey === userKey;
            const roleName = user ? user.short : m.userKey;
            const roleClass = user ? styles[user.logClass] : '';
            return (
              <div
                className={[styles.bubbleWrap, mine ? styles.mine : styles.theirs].join(' ')}
                key={m.id}
              >
                <span className={`${styles.author} ${roleClass}`}>
                  {roleName} · {m.ts}
                </span>
                <span className={styles.bubble}>{m.text}</span>
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
          placeholder="Transmitir mensaje…"
          maxLength={300}
        />
        <button
          className={styles.sendBtn}
          type="button"
          onClick={handleSend}
          aria-label="Enviar mensaje"
        >
          <Icon name="send" />
        </button>
      </div>
    </Panel>
  );
}
