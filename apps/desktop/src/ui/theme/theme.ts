import type { ThemeSetting } from '@scrb/contracts';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  if (setting === 'system') return prefersDark ? 'dark' : 'light';
  return setting;
}

const darkQuery = '(prefers-color-scheme: dark)';

/** Applies `setting` to the document and follows the OS until the returned function is called. */
export function applyTheme(setting: ThemeSetting): () => void {
  const query = window.matchMedia(darkQuery);
  const update = () => {
    document.documentElement.dataset['theme'] = resolveTheme(setting, query.matches);
  };
  update();
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
}
