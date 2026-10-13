export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'tcg.theme';

export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

export function resolveTheme(): Theme {
  return getStoredTheme() ?? getSystemTheme();
}

const THEME_COLOR: Record<Theme, string> = {
  dark: '#0b1016',
  light: '#f2efe9',
};

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export function setThemePreference(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

/** Run before React mounts to avoid theme flash. */
export function initTheme() {
  applyTheme(resolveTheme());
}
