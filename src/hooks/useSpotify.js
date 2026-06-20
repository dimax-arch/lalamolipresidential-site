import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { useAuth } from '../context/AuthContext.jsx';
import {
  beginAuth,
  disconnect as spotifyDisconnect,
  getCurrentlyPlaying,
  hasTokens,
  isSpotifyConfigured,
} from '../lib/spotify.js';

const POLL_MS = 10000;

function rowToNow(row) {
  if (!row) return null;
  return {
    userKey: row.user_key,
    isPlaying: row.is_playing,
    trackName: row.track_name,
    artistName: row.artist_name,
    albumName: row.album_name,
    albumArtUrl: row.album_art_url,
    trackUrl: row.track_url,
    durationMs: row.duration_ms,
    progressMs: row.progress_ms,
    updatedAt: row.updated_at,
  };
}

export function useSpotify() {
  const { userKey, authId } = useAuth();
  const configured = isSpotifyConfigured();
  const [connected, setConnected] = useState(() => hasTokens());
  const [nowPlaying, setNowPlaying] = useState({ presidente: null, ministro: null });

  // ── Lectura de ambas filas ──
  const refetch = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error } = await supabase.from('now_playing').select('*');
    if (error) {
      console.error('[useSpotify] refetch', error);
      return;
    }
    const next = { presidente: null, ministro: null };
    (data || []).forEach((row) => {
      next[row.user_key] = rowToNow(row);
    });
    setNowPlaying(next);
  }, []);

  // ── Carga inicial + Realtime ──
  useEffect(() => {
    if (!userKey) return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    let active = true;
    let timer = null;
    refetch();

    const channel = supabase
      .channel('spotify-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'now_playing' }, () => {
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

  // ── Publicar mi propia reproducción ──
  const publish = useCallback(
    async (now) => {
      const supabase = getSupabaseClient();
      if (!supabase || !userKey || !authId) return;
      const { error } = await supabase.from('now_playing').upsert(
        {
          user_key: userKey,
          user_id: authId,
          is_playing: Boolean(now?.isPlaying),
          track_name: now?.trackName ?? null,
          artist_name: now?.artistName ?? null,
          album_name: now?.albumName ?? null,
          album_art_url: now?.albumArtUrl ?? null,
          track_url: now?.trackUrl ?? null,
          duration_ms: now?.durationMs ?? null,
          progress_ms: now?.progressMs ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_key' }
      );
      if (error) console.error('[useSpotify] publish', error);
    },
    [userKey, authId]
  );

  // ── Polling de Spotify mientras la pestaña está abierta ──
  useEffect(() => {
    if (!connected || !userKey || !authId) return undefined;
    let active = true;

    const tick = async () => {
      try {
        const now = await getCurrentlyPlaying();
        if (active) await publish(now);
      } catch (err) {
        console.error('[useSpotify] poll', err);
        // Si el refresh token murió, spotify.js ya limpió los tokens.
        if (active && !hasTokens()) setConnected(false);
      }
    };

    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [connected, userKey, authId, publish]);

  // ── Best-effort: marcar "sin sonar" al salir/desmontar ──
  useEffect(() => {
    if (!connected || !userKey || !authId) return undefined;
    const markStopped = () => {
      const supabase = getSupabaseClient();
      if (supabase) {
        supabase
          .from('now_playing')
          .update({ is_playing: false, updated_at: new Date().toISOString() })
          .eq('user_key', userKey)
          .then(() => {}, () => {});
      }
    };
    window.addEventListener('beforeunload', markStopped);
    return () => {
      window.removeEventListener('beforeunload', markStopped);
      markStopped();
    };
  }, [connected, userKey, authId]);

  const connect = useCallback(async () => {
    try {
      await beginAuth();
    } catch (err) {
      console.error('[useSpotify] connect', err);
    }
  }, []);

  const disconnect = useCallback(() => {
    spotifyDisconnect();
    setConnected(false);
    publish({ isPlaying: false });
  }, [publish]);

  return { configured, connected, connect, disconnect, nowPlaying };
}
