// ═══════════════════════════════════════════════════════
//  genshin-notes/index.ts — Supabase Edge Function (Deno)
//
//  Devuelve, para las dos cuentas del gabinete, las Notas
//  en Tiempo Real de Genshin (HoYoLAB `dailyNote`), el
//  Diario del Viajero del mes (`month_info`) y el perfil
//  público con vitrina de Enka.Network. Las cookies de
//  HoYoLAB son credenciales de sesión completas: viven solo
//  aquí, como secrets — nunca llegan al navegador.
//
//  El gateway de Supabase verifica el JWT por defecto, así
//  que solo el presidente y el ministro pueden invocarla.
//
//  Caché en la tabla `genshin_cache` (ver genshin.sql):
//  ~5 min para las notas, `ttl` propio de Enka para el
//  perfil. Recargar la página no dispara N llamadas.
//
//  Secrets requeridos (Supabase → Edge Functions → Secrets):
//    HOYO_PRESIDENTE_LTOKEN   cookie ltoken_v2
//    HOYO_PRESIDENTE_LTUID    cookie ltuid_v2
//    HOYO_PRESIDENTE_UID      UID de juego
//    HOYO_MINISTRO_LTOKEN / _LTUID / _UID (ídem)
//  Opcionales:
//    HOYO_PRESIDENTE_LTMID / HOYO_MINISTRO_LTMID  (ltmid_v2)
//    HOYO_DS_SALT   override del salt del header DS si miHoYo lo rota
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto@1';
import { encodeHex } from 'jsr:@std/encoding@1/hex';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Identificarse ante Enka/HoYoLAB con un User-Agent propio, no el default.
const USER_AGENT = 'PalacioPresidencial/1.0 (+https://lalamoliypipe.com)';

// Salt "global" (overseas) del header DS. Lleva años estable; si miHoYo lo
// rota, se corrige con `supabase secrets set HOYO_DS_SALT=...` sin redeploy.
const DEFAULT_DS_SALT = '6s25p5ox5y14umn1p61aqyyvbvvl3lrt';

const NOTES_TTL = 300; // 5 min — la resina sube 1 cada 8 min, sobra
const DIARY_TTL = 3600; // el Diario del Viajero se actualiza con retraso; 1 h basta
const STORE_TTL = 86400; // characters.json de Enka: cambia una vez por parche
const ERROR_TTL = 60; // los errores se cachean poco para reintentar pronto
const FORCE_MIN_AGE = 30; // guardia mínima aunque el cliente pida force

// Mapa id→icono de personajes que mantiene Enka (para traducir la vitrina).
const STORE_CHARACTERS_URL =
  'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json';

const USER_KEYS = ['presidente', 'ministro'] as const;
type UserKey = (typeof USER_KEYS)[number];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Header DS (dynamic secret) del API overseas ──
// md5("salt=<salt>&t=<unix>&r=<aleatorio de 6>") → "t,r,hash"
async function generateDs(): Promise<string> {
  const salt = Deno.env.get('HOYO_DS_SALT') || DEFAULT_DS_SALT;
  const t = Math.floor(Date.now() / 1000);
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  const digest = await crypto.subtle.digest(
    'MD5',
    new TextEncoder().encode(`salt=${salt}&t=${t}&r=${r}`)
  );
  return `${t},${r},${encodeHex(digest)}`;
}

// El servidor se deriva del UID; no hace falta configurarlo.
function serverFromUid(uid: string): string | null {
  if (uid.startsWith('18')) return 'os_asia';
  switch (uid[0]) {
    case '6':
      return 'os_usa';
    case '7':
      return 'os_euro';
    case '8':
      return 'os_asia';
    case '9':
      return 'os_cht';
    default:
      return null; // UIDs de CN usan otro host y otro salt: fuera de alcance
  }
}

interface HoyoConfig {
  ltoken: string;
  ltuid: string;
  uid: string;
  ltmid?: string;
}

function configFor(userKey: UserKey): HoyoConfig | null {
  const prefix = `HOYO_${userKey.toUpperCase()}`;
  const ltoken = Deno.env.get(`${prefix}_LTOKEN`);
  const ltuid = Deno.env.get(`${prefix}_LTUID`);
  const uid = Deno.env.get(`${prefix}_UID`);
  if (!ltoken || !ltuid || !uid) return null;
  return { ltoken, ltuid, uid, ltmid: Deno.env.get(`${prefix}_LTMID`) || undefined };
}

function cookieFor(config: HoyoConfig): string {
  let cookie = `ltoken_v2=${config.ltoken}; ltuid_v2=${config.ltuid}`;
  if (config.ltmid) cookie += `; ltmid_v2=${config.ltmid}`;
  return cookie;
}

// ── HoYoLAB: Notas en Tiempo Real ──
// Errores tipados: la card distingue cookie vencida de perfil privado.
type NotesResult =
  | { notes: Record<string, unknown>; error: null }
  | { notes: null; error: 'cookie_expired' | 'data_not_public' | 'error'; detail?: string };

function secs(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapNotes(data: Record<string, any>): Record<string, unknown> {
  const transformer = data.transformer ?? {};
  const rt = transformer.recovery_time ?? {};
  return {
    currentResin: data.current_resin ?? 0,
    maxResin: data.max_resin ?? 0,
    resinRecoverySeconds: secs(data.resin_recovery_time),
    finishedTasks: data.finished_task_num ?? 0,
    totalTasks: data.total_task_num ?? 0,
    extraTaskRewardReceived: Boolean(data.is_extra_task_reward_received),
    remainingWeeklyDiscounts: data.remain_resin_discount_num ?? 0,
    weeklyDiscountLimit: data.resin_discount_num_limit ?? 0,
    currentHomeCoin: data.current_home_coin ?? 0,
    maxHomeCoin: data.max_home_coin ?? 0,
    homeCoinRecoverySeconds: secs(data.home_coin_recovery_time),
    currentExpeditions: data.current_expedition_num ?? 0,
    maxExpeditions: data.max_expedition_num ?? 0,
    expeditions: (data.expeditions ?? []).map((e: Record<string, unknown>) => ({
      avatarIcon: e.avatar_side_icon ?? null,
      status: e.status ?? 'Ongoing', // 'Ongoing' | 'Finished'
      remainingSeconds: secs(e.remained_time),
    })),
    transformer: {
      obtained: Boolean(transformer.obtained),
      reached: Boolean(rt.reached),
      recoverySeconds:
        ((secs(rt.Day) * 24 + secs(rt.Hour)) * 60 + secs(rt.Minute)) * 60 + secs(rt.Second),
    },
  };
}

async function fetchNotes(config: HoyoConfig): Promise<NotesResult> {
  const server = serverFromUid(config.uid);
  if (!server) {
    return { notes: null, error: 'error', detail: `UID ${config.uid}: servidor no soportado` };
  }

  const url = new URL('https://bbs-api-os.hoyolab.com/game_record/genshin/api/dailyNote');
  url.searchParams.set('server', server);
  url.searchParams.set('role_id', config.uid);

  const res = await fetch(url, {
    headers: {
      Cookie: cookieFor(config),
      DS: await generateDs(),
      'x-rpc-app_version': '1.5.0',
      'x-rpc-client_type': '5',
      'x-rpc-language': 'es-es',
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return { notes: null, error: 'error', detail: `HoYoLAB HTTP ${res.status}` };
  }

  const body = await res.json().catch(() => null);
  const retcode = body?.retcode;
  if (retcode === 0 && body?.data) {
    return { notes: mapNotes(body.data), error: null };
  }
  // -100 / 10001 / 10103: cookie inválida o vencida — es rutina, no caso de borde.
  if (retcode === -100 || retcode === 10001 || retcode === 10103) {
    return { notes: null, error: 'cookie_expired' };
  }
  // 10102: Battle Chronicle privado o Notas en Tiempo Real desactivadas.
  if (retcode === 10102) {
    return { notes: null, error: 'data_not_public' };
  }
  console.error('[genshin-notes] retcode inesperado', retcode, body?.message);
  return { notes: null, error: 'error', detail: `retcode ${retcode}: ${body?.message ?? '?'}` };
}

// ── HoYoLAB: Diario del Viajero (mes en curso) ──
// No existe API de saldo actual de protogemas; esto es lo más cercano:
// lo ganado este mes, comparativa con el anterior y desglose por fuente.
type DiaryResult =
  | { diary: Record<string, unknown>; error: null }
  | { diary: null; error: 'cookie_expired' | 'data_not_public' | 'error'; detail?: string };

async function fetchDiary(config: HoyoConfig): Promise<DiaryResult> {
  const server = serverFromUid(config.uid);
  if (!server) {
    return { diary: null, error: 'error', detail: `UID ${config.uid}: servidor no soportado` };
  }

  const url = new URL('https://sg-hk4e-api.hoyolab.com/event/ysledgeros/month_info');
  url.searchParams.set('region', server);
  url.searchParams.set('uid', config.uid);
  url.searchParams.set('month', '0'); // 0 = mes en curso
  url.searchParams.set('lang', 'es-es'); // las etiquetas del desglose llegan en español

  const res = await fetch(url, {
    headers: {
      Cookie: cookieFor(config),
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    return { diary: null, error: 'error', detail: `HoYoLAB HTTP ${res.status}` };
  }

  const body = await res.json().catch(() => null);
  const retcode = body?.retcode;
  if (retcode === 0 && body?.data) {
    const d = body.data;
    const m = d.month_data ?? {};
    return {
      diary: {
        month: d.data_month ?? d.month ?? null,
        currentPrimogems: m.current_primogems ?? 0,
        currentMora: m.current_mora ?? 0,
        lastPrimogems: m.last_primogems ?? 0,
        lastMora: m.last_mora ?? 0,
        primogemRate: m.primogem_rate ?? 0, // % de cambio vs mes anterior
        moraRate: m.mora_rate ?? 0,
        todayPrimogems: d.day_data?.current_primogems ?? 0,
        todayMora: d.day_data?.current_mora ?? 0,
        groupBy: (m.group_by ?? []).map((g: Record<string, unknown>) => ({
          action: g.action ?? '',
          num: g.num ?? 0,
          percent: g.percent ?? 0,
        })),
      },
      error: null,
    };
  }
  if (retcode === -100 || retcode === 10001 || retcode === 10103) {
    return { diary: null, error: 'cookie_expired' };
  }
  if (retcode === 10102) {
    return { diary: null, error: 'data_not_public' };
  }
  console.error('[genshin-notes] diario retcode inesperado', retcode, body?.message);
  return { diary: null, error: 'error', detail: `retcode ${retcode}: ${body?.message ?? '?'}` };
}

// ── Enka.Network: perfil público + vitrina de personajes ──
// El perfil completo trae `avatarInfoList` (nivel, constelaciones, arma) con
// IDs numéricos; `store` es el characters.json de Enka (cacheado 24 h) que
// los traduce a iconos. Sin nombres a propósito: la cara del personaje se
// reconoce sola y el detalle completo vive en enka.network/u/{uid}.
type EnkaResult =
  | { enka: Record<string, unknown>; ttl: number; error: null }
  | { enka: null; ttl: number; error: 'error'; detail?: string };

function enkaUi(name: unknown): string | null {
  return typeof name === 'string' && name ? `https://enka.network/ui/${name}.png` : null;
}

function mapShowcase(body: Record<string, any>, store: Record<string, any> | null) {
  if (!store) return null; // sin el store no hay iconos; la UI oculta la vitrina

  const metaFor = (av: Record<string, any>) =>
    // El Viajero se indexa como "10000005-<skillDepotId>"; el resto por id plano.
    store[`${av.avatarId}-${av.skillDepotId}`] ?? store[String(av.avatarId)] ?? null;

  const detailed = Array.isArray(body?.avatarInfoList) ? body.avatarInfoList : null;
  if (detailed) {
    return detailed.map((av: Record<string, any>) => {
      const meta = metaFor(av);
      const costume = av.costumeId ? meta?.Costumes?.[av.costumeId] : null;
      const sideIcon = String(costume?.SideIconName ?? meta?.SideIconName ?? '');
      const weapon = (av.equipList ?? []).find(
        (e: Record<string, any>) => e?.flat?.itemType === 'ITEM_WEAPON'
      );
      return {
        avatarId: av.avatarId,
        icon: enkaUi(sideIcon.replace('_Side', '')),
        level: Number(av.propMap?.['4001']?.val ?? 0),
        constellations: Array.isArray(av.talentIdList) ? av.talentIdList.length : 0,
        fiveStar: typeof meta?.QualityType === 'string' && meta.QualityType.includes('ORANGE'),
        weapon: weapon
          ? {
              icon: enkaUi(weapon.flat?.icon),
              level: weapon.weapon?.level ?? null,
              // affixMap trae rango 0-4; en el juego se muestra R1-R5.
              refinement: weapon.weapon?.affixMap
                ? (Number(Object.values(weapon.weapon.affixMap)[0]) || 0) + 1
                : 1,
            }
          : null,
      };
    });
  }

  // Vitrina con "mostrar detalles" apagado en el juego: solo id + nivel.
  const simple = body?.playerInfo?.showAvatarInfoList;
  if (!Array.isArray(simple)) return [];
  return simple.map((av: Record<string, any>) => {
    const meta = metaFor(av);
    return {
      avatarId: av.avatarId,
      icon: enkaUi(String(meta?.SideIconName ?? '').replace('_Side', '')),
      level: av.level ?? 0,
      constellations: null,
      fiveStar: typeof meta?.QualityType === 'string' && meta.QualityType.includes('ORANGE'),
      weapon: null,
    };
  });
}

async function fetchEnka(uid: string, store: Record<string, any> | null): Promise<EnkaResult> {
  const res = await fetch(`https://enka.network/api/uid/${uid}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    return { enka: null, ttl: ERROR_TTL, error: 'error', detail: `Enka HTTP ${res.status}` };
  }
  const body = await res.json().catch(() => null);
  const p = body?.playerInfo;
  if (!p) {
    return { enka: null, ttl: ERROR_TTL, error: 'error', detail: 'Enka sin playerInfo' };
  }
  return {
    enka: {
      uid, // el cliente lo usa para enlazar a enka.network/u/{uid}
      nickname: p.nickname ?? null,
      level: p.level ?? null, // Rango de Aventura
      worldLevel: p.worldLevel ?? null,
      signature: p.signature ?? null,
      achievements: p.finishAchievementNum ?? null,
      abyssFloor: p.towerFloorIndex ?? null,
      abyssChamber: p.towerLevelIndex ?? null,
      characters: mapShowcase(body, store),
    },
    // Respetar el ttl que manda Enka (segundos hasta poder refrescar).
    ttl: Math.max(secs(body?.ttl), 60),
    error: null,
  };
}

// ── Caché en Postgres (tabla genshin_cache, solo service role) ──
interface CacheRow {
  cache_key: string;
  payload: Record<string, unknown>;
  fetched_at: string;
  ttl_seconds: number;
}

function isFresh(row: CacheRow | undefined, minAge = 0): row is CacheRow {
  if (!row) return false;
  const age = (Date.now() - new Date(row.fetched_at).getTime()) / 1000;
  const limit = minAge > 0 ? Math.min(row.ttl_seconds, minAge) : row.ttl_seconds;
  return age < limit;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let force = false;
  try {
    const body = await req.json();
    force = Boolean(body?.force);
  } catch {
    // Sin body: comportamiento normal (caché completa).
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const keys = [
    ...USER_KEYS.flatMap((u) => [`notes_${u}`, `enka_${u}`, `diary_${u}`]),
    'store_characters',
  ];
  const { data: cacheRows, error: cacheError } = await supabase
    .from('genshin_cache')
    .select('*')
    .in('cache_key', keys);
  if (cacheError) console.error('[genshin-notes] lectura de caché', cacheError);
  const cache = new Map<string, CacheRow>((cacheRows ?? []).map((r: CacheRow) => [r.cache_key, r]));
  const upserts: CacheRow[] = [];

  // characters.json de Enka (id → icono), compartido entre ambas cuentas.
  // Si el fetch falla se reutiliza la copia vencida antes que perder iconos.
  let store: Record<string, any> | null = null;
  {
    const row = cache.get('store_characters');
    if (isFresh(row)) {
      store = row.payload as Record<string, any>;
    } else {
      try {
        const res = await fetch(STORE_CHARACTERS_URL, { headers: { 'User-Agent': USER_AGENT } });
        if (res.ok) {
          store = await res.json();
          upserts.push({
            cache_key: 'store_characters',
            payload: store as Record<string, unknown>,
            fetched_at: new Date().toISOString(),
            ttl_seconds: STORE_TTL,
          });
        }
      } catch (err) {
        console.error('[genshin-notes] characters.json', err);
      }
      if (!store) store = (row?.payload as Record<string, any>) ?? null;
    }
  }

  const result: Record<string, unknown> = {};

  await Promise.all(
    USER_KEYS.map(async (userKey) => {
      const config = configFor(userKey);
      if (!config) {
        result[userKey] = {
          notes: null,
          notesError: 'not_configured',
          notesFetchedAt: null,
          enka: null,
          enkaError: 'not_configured',
          diary: null,
          diaryError: 'not_configured',
        };
        return;
      }

      // `force` salta la caché de notas (con guardia de 30s); Enka siempre
      // respeta su propio ttl — refrescarla antes no devuelve datos nuevos —
      // y el diario se actualiza con horas de retraso, así que tampoco aplica.
      const notesRow = cache.get(`notes_${userKey}`);
      const enkaRow = cache.get(`enka_${userKey}`);
      const diaryRow = cache.get(`diary_${userKey}`);
      const notesFresh = isFresh(notesRow, force ? FORCE_MIN_AGE : 0);
      const enkaFresh = isFresh(enkaRow);
      const diaryFresh = isFresh(diaryRow);

      const [notesPayload, notesFetchedAt] = notesFresh
        ? [notesRow.payload, notesRow.fetched_at]
        : await (async () => {
            const fetched = await fetchNotes(config).catch((err): NotesResult => {
              console.error('[genshin-notes] fetchNotes', userKey, err);
              return { notes: null, error: 'error', detail: String(err) };
            });
            const now = new Date().toISOString();
            upserts.push({
              cache_key: `notes_${userKey}`,
              payload: fetched as unknown as Record<string, unknown>,
              fetched_at: now,
              ttl_seconds: fetched.error ? ERROR_TTL : NOTES_TTL,
            });
            return [fetched as unknown as Record<string, unknown>, now] as const;
          })();

      const enkaPayload = enkaFresh
        ? enkaRow.payload
        : await (async () => {
            const fetched = await fetchEnka(config.uid, store).catch((err): EnkaResult => {
              console.error('[genshin-notes] fetchEnka', userKey, err);
              return { enka: null, ttl: ERROR_TTL, error: 'error', detail: String(err) };
            });
            upserts.push({
              cache_key: `enka_${userKey}`,
              payload: fetched as unknown as Record<string, unknown>,
              fetched_at: new Date().toISOString(),
              ttl_seconds: fetched.ttl,
            });
            return fetched as unknown as Record<string, unknown>;
          })();

      const diaryPayload = diaryFresh
        ? diaryRow.payload
        : await (async () => {
            const fetched = await fetchDiary(config).catch((err): DiaryResult => {
              console.error('[genshin-notes] fetchDiary', userKey, err);
              return { diary: null, error: 'error', detail: String(err) };
            });
            upserts.push({
              cache_key: `diary_${userKey}`,
              payload: fetched as unknown as Record<string, unknown>,
              fetched_at: new Date().toISOString(),
              ttl_seconds: fetched.error ? ERROR_TTL : DIARY_TTL,
            });
            return fetched as unknown as Record<string, unknown>;
          })();

      result[userKey] = {
        notes: notesPayload.notes ?? null,
        notesError: notesPayload.error ?? null,
        notesDetail: notesPayload.detail ?? null,
        notesFetchedAt,
        enka: enkaPayload.enka ?? null,
        enkaError: enkaPayload.error ?? null,
        enkaDetail: enkaPayload.detail ?? null,
        diary: diaryPayload.diary ?? null,
        diaryError: diaryPayload.error ?? null,
        diaryDetail: diaryPayload.detail ?? null,
      };
    })
  );

  if (upserts.length > 0) {
    const { error: upsertError } = await supabase.from('genshin_cache').upsert(upserts);
    if (upsertError) console.error('[genshin-notes] escritura de caché', upsertError);
  }

  return json(result);
});
