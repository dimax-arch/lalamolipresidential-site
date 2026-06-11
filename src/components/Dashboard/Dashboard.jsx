import { usePalacioData } from '../../hooks/usePalacioData.js';
import { usePush } from '../../hooks/usePush.js';
import Header from '../Header/Header.jsx';
import DecretoForm from '../DecretoForm/DecretoForm.jsx';
import MessagePanel from '../MessagePanel/MessagePanel.jsx';
import Agenda from '../Agenda/Agenda.jsx';
import Calendar from '../Calendar/Calendar.jsx';
import PushPrompt from '../PushPrompt/PushPrompt.jsx';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const { items, messages, logs, submitItem, approveItem, rejectItem, deleteItem, sendMessage } =
    usePalacioData();
  const { showPrompt, enable, dismiss } = usePush();

  return (
    <div className={styles.wrapper}>
      <Header />

      <main className={styles.layout}>
        <DecretoForm onSubmit={submitItem} />
        <MessagePanel messages={messages} onSend={sendMessage} />
        <Calendar items={items} />
        <Agenda
          items={items}
          logs={logs}
          onApprove={approveItem}
          onReject={rejectItem}
          onDelete={deleteItem}
        />
      </main>

      <footer className={styles.footer}>
        <div className={styles.divider}>✦ ✦ ✦</div>
        <p>
          Este documento es de carácter confidencial. Acceso restringido al Gabinete Presidencial.
        </p>
      </footer>

      {showPrompt && <PushPrompt onEnable={enable} onDismiss={dismiss} />}
    </div>
  );
}
