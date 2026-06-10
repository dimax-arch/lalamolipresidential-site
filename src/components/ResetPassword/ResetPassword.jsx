import { useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase';
import Particles from '../Particles/Particles.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './ResetPassword.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

const STRENGTH_LEVELS = [
  { pct: '0%', color: 'transparent', text: '' },
  { pct: '25%', color: '#C22020', text: 'Débil' },
  { pct: '50%', color: '#8B6B4A', text: 'Regular' },
  { pct: '75%', color: '#6D4C41', text: 'Buena' },
  { pct: '100%', color: '#2A7A40', text: 'Fuerte ✓' },
];

function scorePassword(val) {
  let score = 0;
  if (val.length >= 8) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  return score;
}

export default function ResetPassword() {
  const showToast = useToast();
  const [view, setView] = useState('loading'); // loading | form | invalid | success
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const recoveryMode = useRef(false);
  const newPassRef = useRef(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setView('invalid');
      return undefined;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode.current = true;
        setView('form');
        setTimeout(() => newPassRef.current?.focus(), 50);
      } else if (event === 'SIGNED_IN' && session && !recoveryMode.current) {
        window.location.href = 'index.html';
      }
    });

    // Si en 4s no llega el evento de recuperación, el enlace es inválido.
    const timer = setTimeout(() => {
      setView((v) => (v === 'loading' ? 'invalid' : v));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const strength = STRENGTH_LEVELS[scorePassword(pass1)];

  async function doReset() {
    setError('');
    if (pass1.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (pass1 !== pass2) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase no configurado.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: pass1 });
    setSaving(false);

    if (updateError) {
      setError('Error: ' + updateError.message);
      return;
    }
    showToast('Contraseña actualizada. ✓', 'success');
    setView('success');
  }

  return (
    <div className={styles.overlay}>
      <Particles />

      <div className={styles.box}>
        <div className={styles.seal}>
          <img src={crown} alt="Corona de laureles" width="72" height="72" />
        </div>
        <div className={styles.eyebrow}>Gabinete Presidencial</div>
        <h1 className={styles.title}>Nueva Contraseña</h1>

        <div className={styles.divider}>✦ ✦ ✦</div>

        {view === 'loading' && (
          <div className={styles.centered}>
            <p className={styles.loadingText}>Verificando enlace…</p>
          </div>
        )}

        {view === 'form' && (
          <>
            <div className="form-group">
              <label className="form-label">Nueva contraseña</label>
              <div className={styles.passwordWrap}>
                <input
                  ref={newPassRef}
                  className="form-input"
                  type={show1 ? 'text' : 'password'}
                  value={pass1}
                  onChange={(e) => setPass1(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') document.getElementById('newPass2')?.focus();
                  }}
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  className={styles.togglePass}
                  type="button"
                  onClick={() => setShow1((v) => !v)}
                >
                  👁
                </button>
              </div>
              <div className={styles.strengthBar}>
                <div
                  className={styles.strengthFill}
                  style={{ width: strength.pct, background: strength.color }}
                />
              </div>
              <div className={styles.strengthLabel} style={{ color: strength.color }}>
                {strength.text}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Confirmar contraseña</label>
              <div className={styles.passwordWrap}>
                <input
                  id="newPass2"
                  className="form-input"
                  type={show2 ? 'text' : 'password'}
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') doReset();
                  }}
                  placeholder="Repite la contraseña"
                />
                <button
                  className={styles.togglePass}
                  type="button"
                  onClick={() => setShow2((v) => !v)}
                >
                  👁
                </button>
              </div>
            </div>

            <div className={styles.error}>{error}</div>

            <button className="btn-decree" type="button" disabled={saving} onClick={doReset}>
              {saving ? 'Guardando…' : 'Establecer nueva contraseña ⚑'}
            </button>
          </>
        )}

        {view === 'invalid' && (
          <div className={styles.centered}>
            <p className={styles.invalidText}>
              El enlace de recuperación es inválido o ha expirado.
              <br />
              Solicita uno nuevo desde el inicio de sesión.
            </p>
            <a href="index.html" className={styles.link}>
              ← Volver al Palacio
            </a>
          </div>
        )}

        {view === 'success' && (
          <div className={styles.centered}>
            <div className={styles.successIcon}>✓</div>
            <p className={styles.successText}>
              Contraseña actualizada correctamente.
              <br />
              Ya puedes iniciar sesión con tu nueva contraseña.
            </p>
            <a href="index.html" className={styles.link}>
              Ir al inicio de sesión →
            </a>
          </div>
        )}

        <div className={styles.footer}>Palacio Presidencial — Acceso restringido al Gabinete.</div>
      </div>
    </div>
  );
}
