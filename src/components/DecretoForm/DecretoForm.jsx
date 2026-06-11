import { useState } from 'react';
import Panel from '../Panel/Panel.jsx';

const EMPTY = { title: '', type: 'reunion', date: '', time: '', desc: '', priority: 'media' };

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
    <Panel icon="📜" title="Emitir Decreto / Propuesta">
      <div className="form-group">
        <label className="form-label">Tipo de asunto</label>
        <select className="form-select" value={form.type} onChange={update('type')}>
          <option value="reunion">📅 Reunión / Sesión</option>
          <option value="plan">📝 Solicitud</option>
          <option value="decreto">📜 Decreto Oficial</option>
          <option value="mision">🪶 Petición Formal</option>
          <option value="pelicula">🎬 Selección Cinematográfica</option>
          <option value="juego">🎮 Operación Gaming</option>
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
          rows={3}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Prioridad</label>
        <select className="form-select" value={form.priority} onChange={update('priority')}>
          <option value="alta">🔴 Alta — Asunto de Estado</option>
          <option value="media">🟡 Media — Agenda regular</option>
          <option value="baja">🟢 Baja — Cuando se pueda</option>
        </select>
      </div>

      <button className="btn-decree" type="button" onClick={handleSubmit}>
        Presentar ante el Consejo ⚑
      </button>
    </Panel>
  );
}
