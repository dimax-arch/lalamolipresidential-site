import { useEffect, useState } from 'react';
import Panel from '../Panel/Panel.jsx';
import Icon from '../Icons/Icons.jsx';
import styles from './DecretoForm.module.css';

const EMPTY = { title: '', type: 'reunion', date: '', time: '', desc: '', priority: 'media' };

const PRIORITIES = [
  { key: 'alta', label: 'Alta' },
  { key: 'media', label: 'Media' },
  { key: 'baja', label: 'Baja' },
];

// En pantallas angostas el formulario se abre en una ventana modal.
const NARROW_QUERY = '(max-width: 900px)';

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

function Fields({ form, update, setPriority, wide }) {
  return (
    <div className={wide ? styles.gridWide : undefined}>
      <div className="form-group">
        <label className="form-label">Tipo de asunto</label>
        <select className="form-select" value={form.type} onChange={update('type')}>
          <option value="reunion">Reunión / Sesión</option>
          <option value="plan">Solicitud</option>
          <option value="decreto">Decreto oficial</option>
          <option value="mision">Petición formal</option>
          <option value="pelicula">Selección cinematográfica</option>
          <option value="juego">Operación gaming</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">Título del decreto</label>
        <input
          className="form-input"
          type="text"
          value={form.title}
          onChange={update('title')}
          placeholder="Ej: Sesión de emergencia — CK3"
          maxLength={120}
        />
      </div>

      <div className={wide ? styles.rowWide : undefined}>
        <div className={wide ? styles.flatten : 'form-row'}>
          <div className="form-group">
            <label className="form-label">Fecha propuesta</label>
            <input className="form-input" type="date" value={form.date} onChange={update('date')} />
          </div>
          <div className="form-group">
            <label className="form-label">Hora (opcional)</label>
            <input className="form-input" type="time" value={form.time} onChange={update('time')} />
          </div>
        </div>

        <div className={`form-group ${styles.prioGroup}`}>
          <label className="form-label">Prioridad</label>
          <div className={styles.prioRow}>
            {PRIORITIES.map((p) => (
              <button
                key={p.key}
                type="button"
                className={[styles.prioBtn, form.priority === p.key && styles.prioActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setPriority(p.key)}
              >
                <span className={styles.prioDot} data-prio={p.key} />
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`form-group ${wide ? styles.descWide : ''}`}>
        <label className="form-label">Descripción / Argumentos</label>
        <textarea
          className={`form-textarea ${wide ? styles.textareaWide : ''}`}
          value={form.desc}
          onChange={update('desc')}
          placeholder="Exponga los fundamentos del presente decreto ante el consejo…"
          rows={wide ? 9 : 4}
        />
      </div>
    </div>
  );
}

export default function DecretoForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY);
  const [modalOpen, setModalOpen] = useState(false);
  const isNarrow = useIsNarrow();

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setPriority = (key) => setForm((f) => ({ ...f, priority: key }));

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  async function handleSubmit() {
    const result = await onSubmit(form);
    if (result?.ok) {
      setForm((f) => ({ ...EMPTY, type: f.type, priority: f.priority }));
      setModalOpen(false);
    }
  }

  const submitBtn = (
    <button className="btn-decree" type="button" onClick={handleSubmit}>
      <Icon name="flag" size={13} />
      Presentar ante el consejo
    </button>
  );

  // ── Pantalla angosta: tarjeta lanzadora + ventana modal ──
  if (isNarrow) {
    return (
      <>
        <Panel icon={<Icon name="fileText" />} title="Emitir decreto">
          <div className={styles.launcher}>
            <span className={styles.launcherIcon}>
              <Icon name="fileText" size={22} />
            </span>
            <p className={styles.launcherText}>¿Un nuevo asunto de Estado?</p>
            <button className="btn-decree" type="button" onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={13} />
              Emitir nuevo decreto
            </button>
          </div>
        </Panel>

        {modalOpen && (
          <div className={styles.backdrop} role="dialog" aria-modal="true">
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <span className={styles.modalIcon}>
                  <Icon name="fileText" />
                </span>
                <span className={styles.modalTitle}>Emitir decreto o propuesta</span>
                <button
                  type="button"
                  className={styles.modalClose}
                  aria-label="Cerrar"
                  onClick={() => setModalOpen(false)}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
              <div className={styles.modalBody}>
                <Fields form={form} update={update} setPriority={setPriority} wide={false} />
              </div>
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </button>
                {submitBtn}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Escritorio: formulario amplio fijo en la columna ancha ──
  return (
    <Panel icon={<Icon name="fileText" />} title="Emitir decreto o propuesta">
      <div className={styles.wideForm}>
        <Fields form={form} update={update} setPriority={setPriority} wide />
        {submitBtn}
      </div>
    </Panel>
  );
}
