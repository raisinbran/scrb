import { useEffect, useState } from 'react';
import { AppShell } from './shell/AppShell.tsx';
import { SCREENS, type ScreenId } from './screens/index.ts';
import { readStored, writeStored } from './lib/stored-value.ts';

const SCREEN_KEY = 'scrb.screen';

function restoreScreen(): ScreenId {
  const stored = readStored<ScreenId>(SCREEN_KEY);
  return SCREENS.some((screen) => screen.id === stored) ? (stored as ScreenId) : 'live';
}

export function App() {
  const [screenId, setScreenId] = useState<ScreenId>(restoreScreen);

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
    setScreenId(id);
    writeStored(SCREEN_KEY, id);
  };

  const Screen = SCREENS.find((screen) => screen.id === screenId)?.component;
  return (
    <AppShell screenId={screenId} onSelectScreen={selectScreen}>
      {Screen && <Screen />}
    </AppShell>
  );
}
