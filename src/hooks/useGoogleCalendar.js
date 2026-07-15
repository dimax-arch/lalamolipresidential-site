import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  disconnect as googleDisconnect,
  hasTokens,
  listEvents,
} from '../lib/google.js';

// Eventos del Google Calendar del usuario (solo lectura, por dispositivo:
// los tokens viven en localStorage, como los de Spotify). Recibe el mes
// visible del calendario y trae los eventos de ese rango.
export function useGoogleCalendar(year, month) {
  const { userKey, loginWithGoogle } = useAuth();
  const [connected, setConnected] = useState(() => hasTokens());
  const [events, setEvents] = useState([]);

  // El login con Google siembra los tokens justo antes de que cambie
  // userKey; re-evaluamos la conexión en ese momento.
  useEffect(() => {
    setConnected(hasTokens());
  }, [userKey]);

  useEffect(() => {
    if (!connected || !userKey) {
      setEvents([]);
      return undefined;
    }
    let active = true;

    // La rejilla del mes muestra días vecinos: ±1 semana de margen.
    const timeMin = new Date(year, month, -6).toISOString();
    const timeMax = new Date(year, month + 1, 8).toISOString();

    listEvents(timeMin, timeMax)
      .then((list) => {
        if (active) setEvents(list);
      })
      .catch((err) => {
        console.error('[useGoogleCalendar] listEvents', err);
        // Si el refresh token murió, google.js ya limpió los tokens.
        if (active && !hasTokens()) {
          setConnected(false);
          setEvents([]);
        }
      });

    return () => {
      active = false;
    };
  }, [connected, userKey, year, month]);

  // Conectar = repetir el login con Google (pide el scope de calendario
  // y vuelve con provider_token). Requiere que el correo de Google
  // coincida con el de la cuenta del gabinete.
  const connect = useCallback(async () => {
    const result = await loginWithGoogle();
    if (result?.error) console.error('[useGoogleCalendar] connect', result.error);
  }, [loginWithGoogle]);

  const disconnect = useCallback(() => {
    googleDisconnect();
    setConnected(false);
    setEvents([]);
  }, []);

  return { connected, events, connect, disconnect };
}
