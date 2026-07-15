import { usePalacioData } from '../../hooks/usePalacioData.js';
import { usePush } from '../../hooks/usePush.js';
import Header from '../Header/Header.jsx';
import DecretoForm from '../DecretoForm/DecretoForm.jsx';
import MessagePanel from '../MessagePanel/MessagePanel.jsx';
import Agenda from '../Agenda/Agenda.jsx';
import Calendar from '../Calendar/Calendar.jsx';
import DocumentsPanel from '../DocumentsPanel/DocumentsPanel.jsx';
import SpotifyPanel from '../SpotifyPanel/SpotifyPanel.jsx';
import PushPrompt from '../PushPrompt/PushPrompt.jsx';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { items, messages, logs, submitItem, approveItem, rejectItem, deleteItem, sendMessage } =
    usePalacioData();
  const { showPrompt, enable, dismiss } = usePush();

  return (
    <div className={styles.wrapper}>
      <Header />

      {/* Un solo scroller: fila superior (decreto / chat / carril) y debajo
          calendario y agenda a lo ancho, como en el rediseño. */}
      <main className={styles.shell}>
        <div className={styles.topGrid}>
          <DecretoForm onSubmit={submitItem} />
          <MessagePanel messages={messages} onSend={sendMessage} />
          <div className={styles.rail}>
            <SpotifyPanel />
            <DocumentsPanel />
          </div>
        </div>

        <Calendar items={items} />
        <Agenda
          items={items}
          logs={logs}
          onApprove={approveItem}
          onReject={rejectItem}
          onDelete={deleteItem}
        />

        <footer className={styles.footer}>
          <p>Documento confidencial · Acceso restringido al Gabinete Presidencial</p>
        </footer>
      </main>

      {showPrompt && <PushPrompt onEnable={enable} onDismiss={dismiss} />}
    </div>
  );
}
