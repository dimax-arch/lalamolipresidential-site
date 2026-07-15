import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { getSupabaseClient } from '../../lib/supabase';
import Particles from '../Particles/Particles.jsx';
import ThemeToggle from '../ThemeToggle/ThemeToggle.jsx';
import Icon from '../Icons/Icons.jsx';
import styles from './Login.module.css';

const crown = `${import.meta.env.BASE_URL}coronalaureles.png`;

export default function Login() {
  const { login, loginWithSpotify, configError, authNotice } = useAuth();
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

  useEffect(() => {
    if (authNotice) setError(authNotice);
  }, [authNotice]);

  async function handleSpotifyLogin() {
    setError('');
    const result = await loginWithSpotify();
    if (result?.error) setError(result.error);
    // Si todo va bien, el navegador redirige a Spotify.
  }

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

      <div className={styles.themeCorner}>
        <ThemeToggle />
      </div>

      <div className={styles.box}>
        <div className={styles.seal}>
          <img src={crown} alt="Corona de laureles" width="50" height="50" />
        </div>
        <div className={styles.eyebrow}>Acceso restringido</div>
        <h1 className={styles.title}>Gestión Presidencial</h1>
        <p className={styles.subtitle}>Identifíquese ante el sistema</p>

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
                  aria-label="Mostrar/ocultar contraseña"
                  onClick={() => setShowPass((v) => !v)}
                >
                  <Icon name={showPass ? 'eyeOff' : 'eye'} />
                </button>
              </div>
            </div>

            <div className={styles.error}>{error}</div>

            <button className="btn-decree" type="button" disabled={loading} onClick={handleLogin}>
              {loading ? 'Verificando…' : 'Verificar identidad'}
            </button>
            <button className={styles.forgot} type="button" onClick={openForgot}>
              ¿Olvidé mi contraseña?
            </button>

            <div className={styles.orSep}>o</div>

            <button className={styles.spotifyBtn} type="button" onClick={handleSpotifyLogin}>
              <svg className={styles.spotifyIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14 4.38-1.32 9.78-.66 13.5 1.62.36.18.6.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.66-1.56.36z" />
              </svg>
              Entrar con Spotify
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
              {forgotLoading ? 'Enviando…' : 'Enviar enlace de recuperación'}
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

        <div className={styles.footer}>Solo miembros del Gabinete Presidencial</div>
      </div>
    </div>
  );
}
