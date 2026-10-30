import type { ThemeSetting } from '@scrb/contracts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Screen } from './Screen.tsx';
import styles from './SettingsScreen.module.css';

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

const PENDING_SECTIONS = [
  'Audio devices and presets',
  'Transcription quality',
  'Models',
  'Summary default length',
  'Storage location',
  'Auto-delete',
  'Location for the privacy banner',
];

export function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  return (
    <Screen title="Settings">
      <fieldset className={styles.section}>
        <legend className={styles.legend}>Theme</legend>
        {THEME_OPTIONS.map((option) => (
          <label key={option.value} className={styles.option}>
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {PENDING_SECTIONS.map((section) => (
        <section key={section} className={styles.section}>
          <h2 className={styles.legend}>{section}</h2>
        </section>
      ))}
    </Screen>
  );
}
