import { createContext, useContext, useEffect, useState } from 'react';
import { getConfigError, getSupabaseClient } from '../lib/supabase';
import { ROLE_TO_USER_KEY, USERS } from '../lib/constants';

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
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      applySession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      applySession(session);
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

  async function logout() {
    const supabase = getSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setUserKey(null);
    setAuthId(null);
  }

  const profile = userKey ? USERS[userKey] : null;

  return (
    <AuthContext.Provider value={{ userKey, authId, profile, loading, configError, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
