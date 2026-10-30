import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ThemeSetting } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';
import { readStored, writeStored } from '../lib/stored-value.ts';
import { applyTheme } from './theme.ts';

// Cached so the first paint matches, before the settings call returns.
const CACHE_KEY = 'scrb.theme';

interface ThemeContextValue {
  theme: ThemeSetting;
  setTheme(theme: ThemeSetting): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const [theme, setThemeState] = useState<ThemeSetting>(
    () => readStored<ThemeSetting>(CACHE_KEY) ?? 'system',
  );

  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => {
    let current = true;
    void backend.call('getSettings').then(
      (settings) => {
        if (current) setThemeState(settings.theme);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [backend]);

  const setTheme = useCallback(
    (next: ThemeSetting) => {
      setThemeState(next);
      writeStored(CACHE_KEY, next);
      void backend.call('updateSettings', { theme: next });
    },
    [backend],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
