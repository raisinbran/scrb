import { useEffect, useState } from 'react';
import { FirstLaunchLocation } from './components/FirstLaunchLocation.tsx';
import { SpeakerSuggestionsProvider } from './components/speakers/SpeakerSuggestions.tsx';
import { Overlay } from './components/Overlay.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { AppShell } from './shell/AppShell.tsx';
import { SCREENS, type ScreenId } from './screens/index.ts';
import { readStored, writeStored } from './lib/stored-value.ts';
import { OPEN_MEETING_KEY } from './screens/RecordingsScreen.tsx';

const SCREEN_KEY = 'scrb.screen';

function restoreScreen(): ScreenId {
  const stored = readStored<ScreenId>(SCREEN_KEY);
  return SCREENS.some((screen) => screen.id === stored) ? (stored as ScreenId) : 'live';
}

export function App() {
  const [screenId, setScreenId] = useState<ScreenId>(restoreScreen);
  const [setupRound, setSetupRound] = useState(0);
  const [backRound, setBackRound] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setScreenId('help');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectScreen = (id: ScreenId) => {
    // Pressing the tab of the screen you are on leaves a meeting and shows the list again.
    // Recordings is the only screen with a page of its own; the others use dialogs.
    if (id === screenId && id === 'recordings' && readStored<string>(OPEN_MEETING_KEY)) {
      writeStored(OPEN_MEETING_KEY, null);
      setBackRound((round) => round + 1);
    }
    setScreenId(id);
    writeStored(SCREEN_KEY, id);
  };

  const Screen = SCREENS.find((screen) => screen.id === screenId)?.component;
  return (
    <SpeakerSuggestionsProvider>
      {/* inert keeps keys and screen readers on the settings panel; nothing behind it is unmounted. */}
      <div className="app-root" inert={settingsOpen}>
        <AppShell
          screenId={screenId}
          settingsOpen={settingsOpen}
          onSelectScreen={selectScreen}
          onOpenSettings={() => setSettingsOpen(true)}
        >
          {Screen && <Screen key={`${setupRound}-${backRound}`} />}
        </AppShell>
      </div>
      {settingsOpen && (
        <Overlay label="Settings" onClose={() => setSettingsOpen(false)}>
          <SettingsScreen />
        </Overlay>
      )}
      <FirstLaunchLocation onAnswered={() => setSetupRound((round) => round + 1)} />
    </SpeakerSuggestionsProvider>
  );
}
