import type { ComponentType } from 'react';
import { HelpScreen } from './HelpScreen.tsx';
import { LiveScreen } from './LiveScreen.tsx';
import { RecordingsScreen } from './RecordingsScreen.tsx';
import { SettingsScreen } from './SettingsScreen.tsx';
import { SpeakersScreen } from './SpeakersScreen.tsx';
import { VocabularyScreen } from './VocabularyScreen.tsx';

export type ScreenId = 'live' | 'recordings' | 'speakers' | 'vocabulary' | 'settings' | 'help';

export interface ScreenEntry {
  id: ScreenId;
  label: string;
  component: ComponentType;
  /** SVG path on a 24-unit grid. */
  icon: string;
  pinnedToBottom?: boolean;
}

export const SCREENS: ScreenEntry[] = [
  {
    id: 'live',
    label: 'Live',
    component: LiveScreen,
    icon: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  },
  {
    id: 'recordings',
    label: 'Recordings',
    component: RecordingsScreen,
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6.5 12A5.5 5.5 0 0 1 12 6.5',
  },
  {
    id: 'speakers',
    label: 'Speakers',
    component: SpeakersScreen,
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  },
  {
    id: 'vocabulary',
    label: 'Vocabulary',
    component: VocabularyScreen,
    icon: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12',
  },
  {
    id: 'settings',
    label: 'Settings',
    component: SettingsScreen,
    icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    pinnedToBottom: true,
  },
  {
    id: 'help',
    label: 'Help',
    component: HelpScreen,
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01',
    pinnedToBottom: true,
  },
];
