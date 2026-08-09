import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from '../context/AuthContext.jsx';

// Datos de Genshin para las dos cuentas, vía la Edge Function `genshin-notes`
// (las cookies de HoYoLAB viven solo en el servidor). A diferencia de los
// otros hooks no hay Realtime: la función ya cachea ~5 min en Postgres, así
// que basta con re-invocarla con ese mismo ritmo mientras la pestaña vive.
const REFRESH_MS = 5 * 60 * 1000;

export function useGenshin() {
  const { userKey } = useAuth();
  const [data, setData] = useState(null); // { presidente: {...}, ministro: {...} }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // fallo de la invocación completa
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(false);

  const fetchAll = useCallback(async (force = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (force) setRefreshing(true);
    try {
      const { data: payload, error: fnError } = await supabase.functions.invoke('genshin-notes', {
        body: { force },
      });
      if (!activeRef.current) return;
      if (fnError) {
        console.error('[useGenshin] invoke', fnError);
        setError('No se pudo consultar el estado de Teyvat.');
      } else {
        setData(payload);
        setError(null);
      }
    } catch (err) {
      if (!activeRef.current) return;
      console.error('[useGenshin] invoke', err);
      setError('No se pudo consultar el estado de Teyvat.');
    } finally {
      if (activeRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!userKey) return undefined;
    activeRef.current = true;
    fetchAll();
    const interval = setInterval(fetchAll, REFRESH_MS);
    return () => {
      activeRef.current = false;
      clearInterval(interval);
    };
  }, [userKey, fetchAll]);

  // Botón "Actualizar": salta la caché de notas (la función mantiene una
  // guardia mínima de 30 s para no maltratar a HoYoLAB).
  const refresh = useCallback(() => fetchAll(true), [fetchAll]);

  return { data, loading, error, refreshing, refresh };
}
