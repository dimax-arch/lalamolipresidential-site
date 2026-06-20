import { useState } from 'react';
import { useDocumentos } from '../../hooks/useDocumentos.js';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import { USERS } from '../../lib/constants';
import Panel, { PanelBadge } from '../Panel/Panel.jsx';
import styles from './DocumentsPanel.module.css';

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'enlace';
  }
}

// Detecta el tipo de archivo a partir de la URL de Google.
function fileKind(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('/spreadsheets/')) return 'sheets';
  if (u.includes('/document/')) return 'docs';
  if (u.includes('/presentation/')) return 'slides';
  if (u.includes('/forms/')) return 'forms';
  if (u.includes('drive.google.com')) return 'drive';
  return 'link';
}

const KIND_META = {
  sheets: { label: 'Google Sheets', color: '#0f9d58' },
  docs: { label: 'Google Docs', color: '#1a73e8' },
  slides: { label: 'Google Slides', color: '#e8910c' },
  forms: { label: 'Google Forms', color: '#7248b9' },
  drive: { label: 'Google Drive', color: '#00a98e' },
  link: { label: 'Enlace', color: '#8b6b4a' },
};

function FileIcon({ kind, color }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2.5" fill={color} />
      <g fill="none" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'sheets' && (
          <>
            <rect x="7.3" y="7.3" width="9.4" height="9.4" rx="0.6" />
            <line x1="7.3" y1="10.8" x2="16.7" y2="10.8" />
            <line x1="7.3" y1="14.2" x2="16.7" y2="14.2" />
            <line x1="12" y1="7.3" x2="12" y2="16.7" />
          </>
        )}
        {kind === 'docs' && (
          <>
            <line x1="7.5" y1="8" x2="16.5" y2="8" />
            <line x1="7.5" y1="11" x2="16.5" y2="11" />
            <line x1="7.5" y1="14" x2="16.5" y2="14" />
            <line x1="7.5" y1="17" x2="13" y2="17" />
          </>
        )}
        {kind === 'slides' && <rect x="7.3" y="8" width="9.4" height="6.6" rx="0.6" />}
        {kind === 'forms' && (
          <>
            <line x1="9.4" y1="8.5" x2="16.5" y2="8.5" />
            <line x1="9.4" y1="12" x2="16.5" y2="12" />
            <line x1="9.4" y1="15.5" x2="16.5" y2="15.5" />
            <line x1="7.4" y1="8.5" x2="7.5" y2="8.5" />
            <line x1="7.4" y1="12" x2="7.5" y2="12" />
            <line x1="7.4" y1="15.5" x2="7.5" y2="15.5" />
          </>
        )}
        {kind === 'drive' && <path d="M12 8 L16.4 15.5 L7.6 15.5 Z" />}
        {kind === 'link' && (
          <>
            <path d="M10 8 H16 V14" />
            <line x1="16" y1="8" x2="8.8" y2="15.2" />
          </>
        )}
      </g>
    </svg>
  );
}

const EMPTY = { title: '', url: '', description: '' };

export default function DocumentsPanel() {
  const { documentos, addDocumento, deleteDocumento } = useDocumentos();
  const confirm = useConfirm();
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleAdd() {
    if (adding) return;
    setAdding(true);
    const result = await addDocumento(form);
    setAdding(false);
    if (result?.ok) setForm(EMPTY);
  }

  async function handleRemove(doc) {
    const ok = await confirm({ title: doc.title, meta: hostOf(doc.url) }, 'deleteDoc');
    if (ok) deleteDocumento(doc);
  }

  const onKey = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <Panel
      icon="🗂️"
      title="Archivos del Gabinete"
      badge={<PanelBadge green>{documentos.length} ARCHIVOS</PanelBadge>}
    >
      {documentos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🗂️</div>
          <p className="empty-text">Aún no hay archivos compartidos. Agrega el primero abajo.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {documentos.map((doc) => {
            const author = USERS[doc.addedBy];
            const kind = fileKind(doc.url);
            const meta = KIND_META[kind];
            const label = kind === 'link' ? hostOf(doc.url) : meta.label;
            return (
              <a
                key={doc.id}
                className={styles.card}
                style={{ borderLeftColor: meta.color }}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileIcon kind={kind} color={meta.color} />
                <div className={styles.info}>
                  <div className={styles.docTitle}>{doc.title}</div>
                  {doc.description && <div className={styles.docDesc}>{doc.description}</div>}
                  <div className={styles.docFoot}>
                    <span className={styles.host}>{label}</span>
                    {author && <span className={styles.by}>· {author.short}</span>}
                    <span className={styles.open} style={{ color: meta.color }}>
                      Abrir ▶
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.remove}
                  title="Quitar de la lista"
                  aria-label="Quitar de la lista"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleRemove(doc);
                  }}
                >
                  ✕
                </button>
              </a>
            );
          })}
        </div>
      )}

      <div className={styles.addRow}>
        <input
          className="form-input"
          type="text"
          value={form.title}
          onChange={update('title')}
          onKeyDown={onKey}
          placeholder="Nombre (ej: Presupuesto 2026)"
          maxLength={120}
        />
        <input
          className="form-input"
          type="url"
          value={form.url}
          onChange={update('url')}
          onKeyDown={onKey}
          placeholder="Pega el enlace de Google Sheets…"
        />
        <input
          className="form-input"
          type="text"
          value={form.description}
          onChange={update('description')}
          onKeyDown={onKey}
          placeholder="Descripción (opcional)"
          maxLength={120}
        />
        <button className="btn-decree" type="button" disabled={adding} onClick={handleAdd}>
          {adding ? 'Añadiendo…' : 'Añadir ＋'}
        </button>
      </div>
    </Panel>
  );
}
