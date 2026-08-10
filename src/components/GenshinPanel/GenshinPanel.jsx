import { useEffect, useState } from 'react';
import { useGenshin } from '../../hooks/useGenshin.js';
import Icon from '../Icons/Icons.jsx';
import {
  coinsPerHour,
  endTimeLabel,
  formatDuration,
  liveResin,
  rateLabel,
  remainingSeconds,
} from '../../lib/genshin.js';
import styles from './GenshinPanel.module.css';

const ORDER = ['presidente', 'ministro'];

// Identidad propia de esta card: aquí la Presidenta es Lalamoli y el
// Ministro es Pipe (el resto de la app usa las etiquetas de USERS). El
// nombre lo pisa el nickname de Enka cuando la cuenta está configurada.
const CARD_IDENTITY = {
  presidente: { label: 'Presidenta', fallback: 'Lalamoli' },
  ministro: { label: 'Ministro', fallback: 'Pipe' },
};

// Cada error de HoYoLAB tiene su propio mensaje: una cookie vencida es rutina
// (se renueva cada pocas semanas) y no debe verse igual que un perfil privado.
const NOTES_ERRORS = {
  cookie_expired: {
    tone: 'warn',
    title: 'Sesión de HoYoLAB expirada',
    body: 'Toca renovar las cookies (ltoken_v2 / ltuid_v2) en los secrets de Supabase. El procedimiento está en SUPABASE.md.',
  },
  data_not_public: {
    tone: 'info',
    title: 'Datos no públicos en HoYoLAB',
    body: 'En la configuración de HoYoLAB: pon el Battle Chronicle en público y activa las Notas en Tiempo Real.',
  },
  not_configured: {
    tone: 'muted',
    title: 'Cuenta sin configurar',
    body: 'Faltan los secrets HOYO_* de esta cuenta en Supabase (ver SUPABASE.md).',
  },
  error: {
    tone: 'danger',
    title: 'HoYoLAB no respondió',
    body: 'Error temporal consultando las Notas en Tiempo Real. Se reintenta solo en unos minutos.',
  },
};

// Versión corta de los errores para el bloque del diario (el aviso grande
// ya lo da la sección de notas cuando la causa es la misma).
const DIARY_ERRORS = {
  cookie_expired: 'Sesión de HoYoLAB expirada.',
  data_not_public: 'Diario no accesible (revisa la privacidad en HoYoLAB).',
  not_configured: 'Cuenta sin configurar.',
  error: 'Diario no disponible por ahora.',
};

function Stat({ label, value, detail, ready }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={[styles.statValue, ready && styles.statReady].filter(Boolean).join(' ')}>
        {value}
      </span>
      {detail && <span className={styles.statDetail}>{detail}</span>}
    </div>
  );
}

function AccountColumn({ memberKey, info, clock }) {
  const identity = CARD_IDENTITY[memberKey];
  const roleClass = memberKey === 'presidente' ? styles.president : styles.minister;
  const enka = info?.enka;
  const notes = info?.notes;
  const notesError = info?.notesError;
  const diary = info?.diary;
  const diaryError = info?.diaryError;
  const fetchedMs = info?.notesFetchedAt ? new Date(info.notesFetchedAt).getTime() : clock;

  // ── Cabecera: identidad desde Enka; si Enka falla, la card degrada al rol ──
  const name = enka?.nickname || identity.fallback;

  let body;
  if (notes) {
    // Proyección local: la resina y los timers avanzan entre refetches.
    const resinRemaining = remainingSeconds(notes.resinRecoverySeconds, fetchedMs, clock);
    const resin = liveResin(notes.currentResin, notes.maxResin, resinRemaining);
    const resinFull = resinRemaining <= 0;
    const resinPct = notes.maxResin > 0 ? Math.min(100, (resin / notes.maxResin) * 100) : 0;

    const coinRemaining = remainingSeconds(notes.homeCoinRecoverySeconds, fetchedMs, clock);
    const coinRate = coinsPerHour(
      notes.currentHomeCoin,
      notes.maxHomeCoin,
      notes.homeCoinRecoverySeconds
    );
    const coinsFull = notes.maxHomeCoin > 0 && coinRemaining <= 0;

    const commissionsDone = notes.finishedTasks >= notes.totalTasks && notes.totalTasks > 0;
    const transformerRemaining = remainingSeconds(
      notes.transformer.recoverySeconds,
      fetchedMs,
      clock
    );
    const transformerReady = notes.transformer.reached || transformerRemaining <= 0;

    body = (
      <>
        {/* Resina: lo único realmente urgente, va primero y en grande */}
        <div className={styles.resin}>
          <div className={styles.resinTop}>
            <span className={styles.resinLabel}>Resina original</span>
            <span className={styles.resinValue}>
              {resin}
              <span className={styles.resinMax}> / {notes.maxResin}</span>
            </span>
          </div>
          <div className={styles.bar}>
            <div
              className={[styles.fill, resinFull && styles.fillFull].filter(Boolean).join(' ')}
              style={{ width: `${resinPct}%` }}
            />
          </div>
          <span className={styles.resinEta}>
            {resinFull
              ? 'Al tope — ¡a gastarla!'
              : `Llena en ${formatDuration(resinRemaining)} · ${endTimeLabel(resinRemaining, clock)}`}
          </span>
        </div>

        <div className={styles.statGrid}>
          <Stat
            label="Comisiones diarias"
            value={`${notes.finishedTasks}/${notes.totalTasks}`}
            ready={commissionsDone && notes.extraTaskRewardReceived}
            detail={
              commissionsDone
                ? notes.extraTaskRewardReceived
                  ? 'Recompensa extra reclamada ✓'
                  : 'Falta reclamar la recompensa extra'
                : 'Aún hay comisiones pendientes'
            }
          />
          <Stat
            label="Jefes semanales"
            value={`${notes.remainingWeeklyDiscounts}/${notes.weeklyDiscountLimit}`}
            ready={notes.remainingWeeklyDiscounts === 0}
            detail={
              notes.remainingWeeklyDiscounts > 0
                ? 'Descuentos de resina disponibles'
                : 'Descuentos usados esta semana ✓'
            }
          />
          <Stat
            label="Té Serenitea"
            value={`${notes.currentHomeCoin.toLocaleString('es')} / ${notes.maxHomeCoin.toLocaleString('es')}`}
            ready={coinsFull}
            detail={
              coinsFull
                ? 'Tetera llena — recoge las monedas'
                : coinRate
                  ? `≈${coinRate}/h · llena ${endTimeLabel(coinRemaining, clock)}`
                  : 'Sin datos de la tetera'
            }
          />
          <Stat
            label="Transformador"
            value={
              !notes.transformer.obtained
                ? '—'
                : transformerReady
                  ? 'Listo'
                  : formatDuration(transformerRemaining)
            }
            ready={notes.transformer.obtained && transformerReady}
            detail={
              !notes.transformer.obtained
                ? 'Paramétrico sin obtener'
                : transformerReady
                  ? 'Se puede usar ya ✓'
                  : 'En enfriamiento'
            }
          />
        </div>

        {/* Expediciones: iconos de los personajes + cuándo terminan */}
        <div className={styles.expeditions}>
          <span className={styles.sectionLabel}>
            Expediciones {notes.currentExpeditions}/{notes.maxExpeditions}
          </span>
          {notes.expeditions.length === 0 ? (
            <span className={styles.expEmpty}>Nadie está de expedición.</span>
          ) : (
            <div className={styles.expList}>
              {notes.expeditions.map((exp, i) => {
                const expRemaining = remainingSeconds(exp.remainingSeconds, fetchedMs, clock);
                const done = exp.status === 'Finished' || expRemaining <= 0;
                return (
                  <div key={i} className={styles.expItem}>
                    {exp.avatarIcon ? (
                      <img className={styles.expAvatar} src={exp.avatarIcon} alt="" />
                    ) : (
                      <span className={styles.expAvatar} />
                    )}
                    <span className={[styles.expTime, done && styles.expDone].join(' ')}>
                      {done ? 'Lista ✓' : formatDuration(expRemaining)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  } else {
    const err = NOTES_ERRORS[notesError] || NOTES_ERRORS.error;
    body = (
      <div className={`${styles.notice} ${styles[`notice_${err.tone}`]}`}>
        <span className={styles.noticeTitle}>
          <Icon name="alertTriangle" size={13} /> {err.title}
        </span>
        <p className={styles.noticeBody}>{err.body}</p>
      </div>
    );
  }

  // ── Vitrina y Diario: independientes de las notas, degradan por separado ──
  const enkaUrl = enka?.uid ? `https://enka.network/u/${enka.uid}` : null;
  const characters = enka?.characters || [];

  const vitrina = characters.length > 0 && (
    <div className={styles.showcase}>
      <div className={styles.showcaseHead}>
        <span className={styles.sectionLabel}>Vitrina</span>
        {enkaUrl && (
          <a className={styles.enkaLink} href={enkaUrl} target="_blank" rel="noreferrer">
            Ver en Enka ↗
          </a>
        )}
      </div>
      <div className={styles.charList}>
        {characters.map((c) => (
          <a
            key={c.avatarId}
            className={styles.charItem}
            href={enkaUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            title={[
              `Nv. ${c.level}`,
              c.constellations != null && `C${c.constellations}`,
              c.weapon && `Arma Nv. ${c.weapon.level} · R${c.weapon.refinement}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          >
            <span
              className={[styles.charFrame, c.fiveStar && styles.charFive]
                .filter(Boolean)
                .join(' ')}
            >
              {c.icon ? (
                <img className={styles.charIcon} src={c.icon} alt="" loading="lazy" />
              ) : (
                <span className={styles.charIcon} />
              )}
              {c.constellations > 0 && <span className={styles.consBadge}>C{c.constellations}</span>}
            </span>
            <span className={styles.charLevel}>Nv. {c.level}</span>
            {c.weapon && (
              <span className={styles.weaponTag}>
                {c.weapon.icon && (
                  <img className={styles.weaponIcon} src={c.weapon.icon} alt="" loading="lazy" />
                )}
                R{c.weapon.refinement}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );

  // Fuentes principales de protogemas del mes (top 3 + "otros").
  const topSources = diary ? [...diary.groupBy].sort((a, b) => b.num - a.num).slice(0, 3) : [];
  const othersPct = diary
    ? diary.groupBy.reduce((sum, g) => sum + g.percent, 0) -
      topSources.reduce((sum, g) => sum + g.percent, 0)
    : 0;

  const diario = diary ? (
    <div className={styles.diary}>
      <span className={styles.sectionLabel}>Diario del mes</span>
      <div className={styles.statGrid}>
        <Stat
          label="Protogemas ganadas"
          value={`✦ ${diary.currentPrimogems.toLocaleString('es')}`}
          detail={`${rateLabel(diary.primogemRate)} vs mes pasado · hoy +${diary.todayPrimogems}`}
        />
        <Stat
          label="Mora ganada"
          value={diary.currentMora.toLocaleString('es')}
          detail={`${rateLabel(diary.moraRate)} vs mes pasado`}
        />
      </div>
      {topSources.length > 0 && (
        <div className={styles.diaryBreakdown}>
          {topSources.map((g) => (
            <span key={g.action} className={styles.sourceChip}>
              {g.action} · {g.percent}%
            </span>
          ))}
          {othersPct > 0 && <span className={styles.sourceChip}>Otros · {othersPct}%</span>}
        </div>
      )}
    </div>
  ) : (
    // Solo mostrar el mini-error si no es el mismo que ya anuncia la sección
    // de notas (p. ej. cookie vencida rompería ambos: con un aviso basta).
    diaryError &&
    diaryError !== notesError && (
      <div className={styles.diary}>
        <span className={styles.sectionLabel}>Diario del mes</span>
        <span className={styles.diaryError}>{DIARY_ERRORS[diaryError] || DIARY_ERRORS.error}</span>
      </div>
    )
  );

  return (
    <div className={styles.column}>
      <div className={styles.colHead}>
        <div className={styles.identity}>
          <span className={`${styles.member} ${roleClass}`}>{identity.label}</span>
          <span className={styles.nickname}>{name}</span>
        </div>
        {enka && (
          <span className={styles.enkaMeta}>
            AR {enka.level} · NM {enka.worldLevel}
            {enka.abyssFloor ? ` · Abismo ${enka.abyssFloor}-${enka.abyssChamber}` : ''}
          </span>
        )}
      </div>
      {body}
      {vitrina}
      {diario}
    </div>
  );
}

export default function GenshinPanel() {
  const { data, loading, error, refreshing, refresh } = useGenshin();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // "Actualizado hace X" según la nota más reciente que tengamos.
  const fetchedTimes = ORDER.map((k) => data?.[k]?.notesFetchedAt)
    .filter(Boolean)
    .map((t) => new Date(t).getTime());
  const newest = fetchedTimes.length > 0 ? Math.max(...fetchedTimes) : null;
  const ageMin = newest ? Math.floor((clock - newest) / 60000) : null;

  // Contenedor propio (no el Panel compartido): la card lleva el skin
  // HoYoverse — navy + dorado, o pergamino en el tema claro — para
  // diferenciarse del resto del despacho.
  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.headIcon}>
          <Icon name="star" size={13} />
        </span>
        <span className={styles.title}>Estado de Teyvat</span>
        <span className={styles.ornament} aria-hidden="true">
          ◆
        </span>
        <div className={styles.actions}>
          {ageMin !== null && (
            <span className={styles.updatedAt}>
              {ageMin < 1 ? 'hace <1 min' : `hace ${ageMin} min`}
            </span>
          )}
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refresh}
            disabled={loading || refreshing}
            title="Actualizar ahora"
          >
            <Icon name="refreshCw" size={12} className={refreshing ? styles.spinning : undefined} />
            Actualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Consultando el estado de Teyvat…</div>
      ) : error ? (
        <div className={`${styles.notice} ${styles.notice_danger}`}>
          <span className={styles.noticeTitle}>
            <Icon name="alertTriangle" size={13} /> {error}
          </span>
          <p className={styles.noticeBody}>
            Puede que la Edge Function `genshin-notes` no esté desplegada todavía.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {ORDER.map((key) => (
            <AccountColumn key={key} memberKey={key} info={data?.[key]} clock={clock} />
          ))}
        </div>
      )}
    </section>
  );
}
