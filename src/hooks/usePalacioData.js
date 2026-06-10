import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { TYPE_LABELS } from '../lib/constants';
import { rowToItem, rowToLog, rowToMessage } from '../lib/mappers';

export function usePalacioData() {
  const { userKey, authId } = useAuth();
  const showToast = useToast();

  const [items, setItems] = useState([]);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);

  const dbErrorToast = useCallback(
    (error, fallback) => {
      console.error(error);
      showToast(fallback + (error?.message ? ': ' + error.message : ''), 'error');
    },
    [showToast]
  );

  const refetchDecretos = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('decretos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      dbErrorToast(error, 'No se pudieron actualizar los decretos');
      return;
    }
    setItems((data || []).map(rowToItem));
  }, [dbErrorToast]);

  const refetchMensajes = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) {
      dbErrorToast(error, 'No se pudo actualizar el canal');
      return;
    }
    setMessages((data || []).map(rowToMessage));
  }, [dbErrorToast]);

  const refetchLogs = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('decreto_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      dbErrorToast(error, 'No se pudo actualizar el historial');
      return;
    }
    setLogs((data || []).map(rowToLog));
  }, [dbErrorToast]);

  // Carga inicial + realtime (debounced)
  useEffect(() => {
    if (!userKey) return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    let active = true;
    const timers = {};
    const schedule = (key, fn) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(fn, 120);
    };

    (async () => {
      const [decretosRes, mensajesRes, logsRes] = await Promise.all([
        supabase.from('decretos').select('*').order('created_at', { ascending: false }),
        supabase.from('mensajes').select('*').order('created_at', { ascending: true }),
        supabase.from('decreto_logs').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      if (!active) return;

      if (decretosRes.error) {
        dbErrorToast(decretosRes.error, 'No se pudieron cargar los decretos');
        setItems([]);
      } else {
        setItems((decretosRes.data || []).map(rowToItem));
      }

      if (mensajesRes.error) {
        dbErrorToast(mensajesRes.error, 'No se pudo cargar el canal');
        setMessages([]);
      } else {
        setMessages((mensajesRes.data || []).map(rowToMessage));
      }

      if (logsRes.error) {
        console.error(logsRes.error);
        setLogs([]);
      } else {
        setLogs((logsRes.data || []).map(rowToLog));
      }
    })();

    const channel = supabase
      .channel('palacio-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decretos' }, () =>
        schedule('decretos', refetchDecretos)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decreto_logs' }, () =>
        schedule('logs', refetchLogs)
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, () =>
        schedule('mensajes', refetchMensajes)
      )
      .subscribe();

    return () => {
      active = false;
      Object.values(timers).forEach(clearTimeout);
      supabase.removeChannel(channel);
    };
  }, [userKey, dbErrorToast, refetchDecretos, refetchMensajes, refetchLogs]);

  // ── Helpers de escritura ──
  const writeLog = useCallback(
    async (eventType, item) => {
      const supabase = getSupabaseClient();
      if (!supabase || !authId) return;
      const { data, error } = await supabase
        .from('decreto_logs')
        .insert({
          decreto_id: item.id || null,
          decreto_title: item.title,
          decreto_type: item.type,
          decreto_priority: item.priority,
          event_type: eventType,
          actor_key: userKey,
          actor_id: authId,
        })
        .select()
        .single();
      if (error) {
        console.error('[writeLog]', error);
        return;
      }
      setLogs((prev) => [rowToLog(data), ...prev]);
    },
    [authId, userKey]
  );

  const addLogEntry = useCallback(
    async (text) => {
      const supabase = getSupabaseClient();
      if (!supabase || !authId || !userKey) return;
      const { data, error } = await supabase
        .from('mensajes')
        .insert({ user_key: userKey, author_id: authId, body: text })
        .select()
        .single();
      if (error) {
        console.error(error);
        return;
      }
      setMessages((prev) => [...prev, rowToMessage(data)]);
    },
    [authId, userKey]
  );

  // ── Acciones ──
  const submitItem = useCallback(
    async (form) => {
      const supabase = getSupabaseClient();
      if (!supabase || !userKey) return { error: 'auth' };

      const title = form.title.trim();
      if (!title) {
        showToast('Falta el título del decreto.', 'error');
        return { error: 'title' };
      }

      const { data, error } = await supabase
        .from('decretos')
        .insert({
          title,
          type: form.type,
          proposed_date: form.date || null,
          proposed_time: form.time || null,
          description: form.desc.trim(),
          priority: form.priority,
          status: 'pending',
          author_key: userKey,
          author_id: authId,
        })
        .select()
        .single();

      if (error) {
        dbErrorToast(error, 'No se pudo registrar el decreto');
        return { error };
      }

      const item = rowToItem(data);
      setItems((prev) => [item, ...prev]);
      await Promise.all([
        writeLog('created', item),
        addLogEntry(`[DECRETO] "${title}" — ${TYPE_LABELS[form.type]}`),
      ]);
      showToast('Decreto presentado al Consejo. ⚑', 'success');
      return { ok: true };
    },
    [userKey, authId, showToast, dbErrorToast, writeLog, addLogEntry]
  );

  const approveItem = useCallback(
    async (item) => {
      const supabase = getSupabaseClient();
      if (!item || !supabase) return;

      if (item.author === userKey && item.status === 'pending') {
        showToast('No puede aprobar sus propios decretos.', 'error');
        return;
      }

      const { error } = await supabase.from('decretos').update({ status: 'approved' }).eq('id', item.id);
      if (error) {
        dbErrorToast(error, 'No se pudo aprobar');
        return;
      }

      const updated = { ...item, status: 'approved' };
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      await Promise.all([writeLog('approved', updated), addLogEntry(`[APROBADO] "${item.title}"`)]);
      showToast('Decreto aprobado. ✓', 'success');
    },
    [userKey, showToast, dbErrorToast, writeLog, addLogEntry]
  );

  const rejectItem = useCallback(
    async (item) => {
      const supabase = getSupabaseClient();
      if (!item || !supabase) return;

      const { error } = await supabase.from('decretos').update({ status: 'rejected' }).eq('id', item.id);
      if (error) {
        dbErrorToast(error, 'No se pudo rechazar');
        return;
      }

      const updated = { ...item, status: 'rejected' };
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      await Promise.all([writeLog('rejected', updated), addLogEntry(`[RECHAZADO] "${item.title}"`)]);
      showToast('Decreto rechazado.', 'error');
    },
    [showToast, dbErrorToast, writeLog, addLogEntry]
  );

  const deleteItem = useCallback(
    async (item) => {
      const supabase = getSupabaseClient();
      if (!item || !supabase) return;

      const { error } = await supabase.from('decretos').delete().eq('id', item.id);
      if (error) {
        dbErrorToast(error, 'No se pudo eliminar');
        return;
      }

      await writeLog('deleted', item);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      showToast('Asunto eliminado del archivo.');
    },
    [showToast, dbErrorToast, writeLog]
  );

  const sendMessage = useCallback(
    async (text) => {
      const supabase = getSupabaseClient();
      const body = text.trim();
      if (!body || !supabase || !userKey) return;

      const { data, error } = await supabase
        .from('mensajes')
        .insert({ user_key: userKey, author_id: authId, body })
        .select()
        .single();

      if (error) {
        dbErrorToast(error, 'No se pudo enviar el mensaje');
        return;
      }
      setMessages((prev) => [...prev, rowToMessage(data)]);
    },
    [userKey, authId, dbErrorToast]
  );

  return {
    items,
    messages,
    logs,
    submitItem,
    approveItem,
    rejectItem,
    deleteItem,
    sendMessage,
  };
}
