// Perfiles por rol (metadata de Supabase)
export const USERS = {
  presidente: {
    role: 'president',
    label: '🎖 PRESIDENTE',
    short: 'Presidente',
    logClass: 'president',
  },
  ministro: {
    role: 'minister',
    label: '📋 MINISTRO',
    short: 'Ministro',
    logClass: 'minister',
  },
};

export const ROLE_TO_USER_KEY = {
  president: 'presidente',
  minister: 'ministro',
};

export const TYPE_LABELS = {
  reunion: '📅 Reunión',
  plan: '🗺 Plan',
  decreto: '📜 Decreto',
  mision: '🎯 Misión',
  pelicula: '🎬 Cine',
  juego: '🎮 Gaming',
};

export const PRIORITY_LABELS = {
  alta: '🔴 Alta',
  media: '🟡 Media',
  baja: '🟢 Baja',
};

export const EVENT_META = {
  created: { label: 'PRESENTADO', badge: 'created', icon: '📜' },
  approved: { label: 'APROBADO', badge: 'approved', icon: '✅' },
  rejected: { label: 'RECHAZADO', badge: 'rejected', icon: '❌' },
  deleted: { label: 'ELIMINADO', badge: 'deleted', icon: '🗑️' },
};

export const CONFIRM_COPY = {
  delete: {
    eyebrow: 'Acción irreversible',
    title: 'Eliminar Decreto',
    warning:
      'Este decreto será eliminado del registro oficial.\nEl evento quedará registrado en el historial.',
    actionLabel: 'Eliminar ✕',
    actionClass: 'delete',
  },
  reject: {
    eyebrow: 'Confirmar rechazo',
    title: 'Rechazar Decreto',
    warning:
      'Este decreto quedará marcado como rechazado.\nEl evento quedará registrado en el historial.',
    actionLabel: 'Rechazar ✗',
    actionClass: 'reject',
  },
};

export const LOGS_PER_PAGE = 20;

// Clave pública VAPID. Debe coincidir con VAPID_PRIVATE_KEY en Supabase.
// Genera el par con `npx web-push generate-vapid-keys`.
export const VAPID_PUBLIC_KEY =
  'BNrIu5oG4vTER3NnkfUwzjSPiokF5NPwoeeF8JQNXqfdbNOiYeICfK-CgsUCGOYec2K4AQ0aUaR_A8HDQz_98h4';
