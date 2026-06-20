import { createContext, useContext, useEffect, useState } from 'react';
import { getConfigError, getSupabaseClient } from '../lib/supabase';
import { ROLE_TO_USER_KEY, USERS } from '../lib/constants';
import { disconnect as disconnectSpotify, seedProviderTokens } from '../lib/spotify';

const AuthContext = createContext(null);

export function userKeyFromAuthUser(user) {
  const role = user?.user_metadata?.role;
  return ROLE_TO_USER_KEY[role] || null;
}

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

      // Login con Spotify (OAuth de Supabase): reutilizamos el token del
      // proveedor para el panel "now playing" (una sola conexión).
      if (event === 'SIGNED_IN' && session?.provider_token) {
        seedProviderTokens({
          accessToken: session.provider_token,
          refreshToken: session.provider_refresh_token,
          expiresIn: 3600,
        });
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        scopes: 'user-read-currently-playing',
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) return { error: error.message };
    return { ok: true }; // el navegador redirige a Spotify
  }

  async function logout() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    disconnectSpotify();
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
