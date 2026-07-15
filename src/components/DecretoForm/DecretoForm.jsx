import { useState } from 'react';
import Panel from '../Panel/Panel.jsx';
import Icon from '../Icons/Icons.jsx';
import styles from './DecretoForm.module.css';

const EMPTY = { title: '', type: 'reunion', date: '', time: '', desc: '', priority: 'media' };

const PRIORITIES = [
  { key: 'alta', label: 'Alta' },
  { key: 'media', label: 'Media' },
  { key: 'baja', label: 'Baja' },
];

export default function DecretoForm({ onSubmit }) {
  const [form, setForm] = useState(EMPTY);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit() {
    const result = await onSubmit(form);
    if (result?.ok) {
      setForm((f) => ({ ...EMPTY, type: f.type, priority: f.priority }));
    }
  }

  return (
    <Panel icon={<Icon name="fileText" />} title="Emitir decreto o propuesta">
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

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Fecha propuesta</label>
          <input className="form-input" type="date" value={form.date} onChange={update('date')} />
        </div>
        <div className="form-group">
          <label className="form-label">Hora (opcional)</label>
          <input className="form-input" type="time" value={form.time} onChange={update('time')} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Descripción / Argumentos</label>
        <textarea
          className="form-textarea"
          value={form.desc}
          onChange={update('desc')}
          placeholder="Exponga los fundamentos del presente decreto ante el consejo…"
          rows={4}
        />
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
              onClick={() => setForm((f) => ({ ...f, priority: p.key }))}
            >
              <span className={styles.prioDot} data-prio={p.key} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <button className="btn-decree" type="button" onClick={handleSubmit}>
        <Icon name="flag" size={13} />
        Presentar ante el consejo
      </button>
    </Panel>
  );
}
