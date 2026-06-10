import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  isPushSupported,
  isVapidConfigured,
  registerServiceWorker,
  subscribeAndSave,
} from '../lib/push';

export function usePush() {
  const { userKey, authId } = useAuth();
  const showToast = useToast();
  const [showPrompt, setShowPrompt] = useState(false);
  const regRef = useRef(null);

  useEffect(() => {
    if (!userKey || !authId) return undefined;
    if (!isPushSupported() || !isVapidConfigured()) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const reg = await registerServiceWorker();
        if (cancelled) return;
        regRef.current = reg;
        console.log('[Push] Service Worker registrado ✓');

        const permission = Notification.permission;
        if (permission === 'denied') return;
        if (permission === 'default') {
          setShowPrompt(true);
          return;
        }
        await subscribeAndSave(reg, getSupabaseClient(), authId, userKey);
      } catch (err) {
        console.error('[Push] Error en setup:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey, authId]);

  const enable = useCallback(async () => {
    setShowPrompt(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && regRef.current) {
        await subscribeAndSave(regRef.current, getSupabaseClient(), authId, userKey);
        showToast('Notificaciones activadas. ✓', 'success');
      }
    } catch (err) {
      console.error('[Push] Error al activar:', err);
    }
  }, [authId, userKey, showToast]);

  const dismiss = useCallback(() => setShowPrompt(false), []);

  return { showPrompt, enable, dismiss };
}
