import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

function rowToDoc(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    description: row.description || '',
    addedBy: row.added_by,
    createdAt: row.created_at,
  };
}

export function useDocumentos() {
  const { userKey, authId } = useAuth();
  const showToast = useToast();
  const [documentos, setDocumentos] = useState([]);

  const refetch = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from('documentos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[useDocumentos] refetch', error);
      return;
    }
    setDocumentos((data || []).map(rowToDoc));
  }, []);

  useEffect(() => {
    if (!userKey) return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    let active = true;
    let timer = null;
    refetch();

    const channel = supabase
      .channel('documentos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documentos' }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (active) refetch();
        }, 120);
      })
      .subscribe();

    return () => {
      active = false;
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userKey, refetch]);

  const addDocumento = useCallback(
    async ({ title, url, description }) => {
      const supabase = getSupabaseClient();
      if (!supabase || !userKey || !authId) return { error: 'auth' };

      const cleanTitle = (title || '').trim();
      let cleanUrl = (url || '').trim();
      if (!cleanTitle) {
        showToast('Falta el nombre del archivo.', 'error');
        return { error: 'title' };
      }
      if (!cleanUrl) {
        showToast('Falta el enlace del archivo.', 'error');
        return { error: 'url' };
      }
      if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = `https://${cleanUrl}`;

      const { data, error } = await supabase
        .from('documentos')
        .insert({
          title: cleanTitle,
          url: cleanUrl,
          description: (description || '').trim() || null,
          added_by: userKey,
          author_id: authId,
        })
        .select()
        .single();
      if (error) {
        console.error(error);
        showToast('No se pudo agregar el archivo: ' + error.message, 'error');
        return { error: 'db' };
      }
      setDocumentos((prev) => [rowToDoc(data), ...prev]);
      showToast('Archivo agregado al gabinete.', 'success');
      return { ok: true };
    },
    [userKey, authId, showToast]
  );

  const deleteDocumento = useCallback(
    async (doc) => {
      const supabase = getSupabaseClient();
      if (!supabase || !doc) return;
      const { error } = await supabase.from('documentos').delete().eq('id', doc.id);
      if (error) {
        showToast('No se pudo quitar el archivo: ' + error.message, 'error');
        return;
      }
      setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
      showToast('Archivo quitado de la lista.');
    },
    [showToast]
  );

  return { documentos, addDocumento, deleteDocumento };
}
