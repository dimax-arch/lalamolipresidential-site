// Tema visual de la app: 'light' (1a — Despacho Claro) o 'dark' (1b — Sala de Situación).
// La preferencia vive en localStorage (preferencia de dispositivo, no dato de la app);
// sin preferencia guardada se sigue el esquema del sistema.
const STORAGE_KEY = 'palacio_theme';

// Color de la barra del navegador/PWA por tema (fondo de página de cada tema).
export const THEME_COLORS = { light: '#f2ede4', dark: '#1d1815' };

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    /* localStorage no disponible (Safari privado, etc.) */
  }
  return null;
}

export function getPreferredTheme() {
  const stored = getStoredTheme();
  if (stored) return stored;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  return 'dark';
}

export function storeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignorar */
  }
}

// Aplica el tema al documento: atributo data-theme + color de barra del navegador.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = THEME_COLORS[theme] || THEME_COLORS.dark;
}
