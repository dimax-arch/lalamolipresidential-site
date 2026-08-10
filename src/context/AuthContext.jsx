import { createContext, useContext, useEffect, useState } from 'react';
import { getConfigError, getSupabaseClient } from '../lib/supabase';
import { USERS } from '../lib/constants';
import { userKeyFromAuthUser } from '../lib/roles';
import { disconnect as disconnectSpotify, seedProviderTokens } from '../lib/spotify';
import { disconnect as disconnectGoogle, seedProviderTokens as seedGoogleTokens } from '../lib/google';

const AuthContext = createContext(null);

// Marca qué proveedor inició el OAuth (sessionStorage sobrevive a la
// redirección). Sin ella no se puede saber de quién es el provider_token
// que llega en SIGNED_IN.
const SS_OAUTH_PROVIDER = 'oauth_provider';

export { userKeyFromAuthUser };

function authErrorMessage(error) {
  const map = {
    'Invalid login credentials': 'Credenciales inválidas. Acceso denegado.',
    'Email not confirmed': 'Debe confirmar su correo antes de acceder.',
    'User not found': 'Usuario no registrado en el sistema.',
  };
  return map[error.message] || error.message || 'Error de autenticación.';
}

export function AuthProvider({ children }) {
  const [userKey, setUserKey] = useState(null);
  const [authId, setAuthId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(null);
  const [authNotice, setAuthNotice] = useState(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setConfigError(getConfigError());
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    const applySession = (session) => {
      const user = session?.user;
      const key = user ? userKeyFromAuthUser(user) : null;
      setUserKey(key);
      setAuthId(user?.id ?? null);

      // Sesión válida pero sin rol (p. ej. una cuenta de Spotify no
      // reconocida): no se permite el acceso y se cierra la sesión.
      if (user && !key) {
        setAuthNotice('Esta cuenta no está autorizada en el Palacio (sin rol asignado).');
        supabase.auth.signOut();
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      applySession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      applySession(session);

      // Login OAuth de Supabase: reutilizamos el token del proveedor
      // (Spotify → panel "now playing"; Google → calendario). El flag de
      // sessionStorage lo pone loginWithSpotify/loginWithGoogle justo antes
      // de redirigir. Sin flag NO se siembra nada: Supabase persiste el
      // provider_token del último OAuth y re-emite SIGNED_IN en cada carga,
      // así que el viejo fallback "se asume Spotify" pisaba los tokens PKCE
      // de Spotify con el token de Google del calendario (y el poll, al
      // fallar el refresh, los borraba — la conexión "no agarraba" nunca).
      if (event === 'SIGNED_IN' && session?.provider_token) {
        const provider = sessionStorage.getItem(SS_OAUTH_PROVIDER);
        sessionStorage.removeItem(SS_OAUTH_PROVIDER);
        const tokens = {
          accessToken: session.provider_token,
          refreshToken: session.provider_refresh_token,
          expiresIn: 3600,
        };
        if (provider === 'google') seedGoogleTokens(tokens);
        else if (provider === 'spotify') seedProviderTokens(tokens);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email, password) {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: getConfigError() || 'Supabase no configurado.' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: authErrorMessage(error) };

    const key = userKeyFromAuthUser(data.user);
    if (!key) {
      await supabase.auth.signOut();
      return {
        error:
          'Su cuenta no tiene rol asignado. En Supabase, añada user_metadata: { "role": "president" } o "minister".',
      };
    }
    return { ok: true, profile: USERS[key] };
  }

  async function loginWithSpotify() {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: getConfigError() || 'Supabase no configurado.' };
    setAuthNotice(null);
    sessionStorage.setItem(SS_OAUTH_PROVIDER, 'spotify');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        // user-read-email es imprescindible: sin él Spotify no entrega el email
        // y Supabase no puede enlazar la identidad con la cuenta del gabinete
        // (crearía un usuario huérfano sin email ni rol). user-read-currently-playing
        // se mantiene para reutilizar el provider_token en el panel "now playing".
        scopes: 'user-read-email user-read-currently-playing',
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { error: error.message };
    return { ok: true }; // el navegador redirige a Spotify
  }

  async function loginWithGoogle() {
    const supabase = getSupabaseClient();
    if (!supabase) return { error: getConfigError() || 'Supabase no configurado.' };
    setAuthNotice(null);
    sessionStorage.setItem(SS_OAUTH_PROVIDER, 'google');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // calendar.readonly permite mostrar el Google Calendar del usuario
        // en el calendario oficial. access_type=offline + prompt=consent son
        // imprescindibles: sin ellos Google no entrega refresh token y la
        // conexión moriría a la hora.
        scopes: 'openid email https://www.googleapis.com/auth/calendar.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { error: error.message };
    return { ok: true }; // el navegador redirige a Google
  }

  async function logout() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    disconnectSpotify();
    disconnectGoogle();
    setUserKey(null);
    setAuthId(null);
  }

  const profile = userKey ? USERS[userKey] : null;

  return (
    <AuthContext.Provider
      value={{
        userKey,
        authId,
        profile,
        loading,
        configError,
        authNotice,
        login,
        loginWithSpotify,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
