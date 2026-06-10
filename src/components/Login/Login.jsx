import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getSupabaseClient } from '../../lib/supabase';
import Particles from '../Particles/Particles.jsx';
import styles from './Login.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

export default function Login() {
  const { login, configError } = useAuth();
  const showToast = useToast();

  const [mode, setMode] = useState('login'); // login | forgot | forgotSuccess
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(configError || '');
  const [loading, setLoading] = useState(false);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const passRef = useRef(null);

  async function handleLogin() {
    if (!email.trim() || !pass) {
      setError('Indique correo y contraseña.');
      return;
    }
    setError('');
    setLoading(true);
    const result = await login(email.trim(), pass);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    showToast('Acceso concedido. Bienvenido/a, ' + result.profile.short + '.', 'success');
  }

  function openForgot() {
    setForgotEmail(email.trim());
    setForgotError('');
    setMode('forgot');
  }

  async function sendReset() {
    setForgotError('');
    if (!forgotEmail.trim()) {
      setForgotError('Escribe tu correo electrónico.');
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setForgotError(configError || 'Supabase no configurado.');
      return;
    }
    setForgotLoading(true);
    const { error: resetError } = await client.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: new URL('reset-password.html', window.location.href).href,
    });
    setForgotLoading(false);
    if (resetError) {
      setForgotError('Error: ' + resetError.message);
      return;
    }
    setSentEmail(forgotEmail.trim());
    setMode('forgotSuccess');
  }

  return (
    <div className={styles.overlay}>
      <Particles />

      <div className={styles.box}>
        <div className={styles.seal}>
          <img src={crown} alt="Corona de laureles" width="72" height="72" />
        </div>
        <div className={styles.eyebrow}>Documento Clasificado — Acceso Restringido</div>
        <h1 className={styles.title}>Gestión presidencial</h1>
        <p className={styles.subtitle}>Identifíquese ante el sistema</p>

        <div className={styles.divider}>✦ ✦ ✦</div>

        {mode === 'login' && (
          <>
            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') passRef.current?.focus();
                }}
                placeholder="presidente@palacio.local"
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <div className={styles.passwordWrap}>
                <input
                  ref={passRef}
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLogin();
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  className={styles.togglePass}
                  type="button"
                  title="Mostrar/ocultar"
                  onClick={() => setShowPass((v) => !v)}
                >
                  👁
                </button>
              </div>
            </div>

            <div className={styles.error}>{error}</div>

            <button className="btn-decree" type="button" disabled={loading} onClick={handleLogin}>
              {loading ? 'Verificando…' : 'Verificar Identidad ⚑'}
            </button>
            <button className={styles.forgot} type="button" onClick={openForgot}>
              ¿Olvidé mi contraseña?
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <p className={styles.forgotHint}>
              Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
            </p>
            <div className="form-group">
              <label className="form-label">Correo electrónico</label>
              <input
                className="form-input"
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendReset();
                }}
                placeholder="tu@correo.com"
              />
            </div>
            <div className={styles.error}>{forgotError}</div>
            <button className="btn-decree" type="button" disabled={forgotLoading} onClick={sendReset}>
              {forgotLoading ? 'Enviando…' : 'Enviar enlace de recuperación ✉'}
            </button>
            <button className={styles.forgot} type="button" onClick={() => setMode('login')}>
              ← Volver al inicio de sesión
            </button>
          </>
        )}

        {mode === 'forgotSuccess' && (
          <div className={styles.forgotSuccess}>
            <div className={styles.successIcon}>✉</div>
            <p className={styles.successMsg}>
              Enlace enviado a
              <br />
              <strong>{sentEmail}</strong>
              <br />
              <br />
              Revisa tu bandeja de entrada y haz clic en el enlace para crear tu nueva contraseña.
            </p>
            <button className={styles.forgot} type="button" onClick={() => setMode('login')}>
              ← Volver al inicio de sesión
            </button>
          </div>
        )}

        <div className={styles.footer}>
          Acceso disponible solo para miembros del Gabinete Presidencial.
        </div>
      </div>
    </div>
  );
}
