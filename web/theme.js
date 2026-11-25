/** Theme preference: explicit user choice, otherwise follow OS preference. */
const THEME_KEY = 'giganta-theme';

export function getTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (error) {
    // Storage may be unavailable in private or restricted browsing contexts.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  const normalized = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = normalized;
  document.documentElement.style.colorScheme = normalized;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = normalized === 'dark' ? '#171717' : '#fafafa';
  return normalized;
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, next); } catch (error) {
    console.warn('Preferensi tema tidak dapat disimpan:', error);
  }
  return applyTheme(next);
}
