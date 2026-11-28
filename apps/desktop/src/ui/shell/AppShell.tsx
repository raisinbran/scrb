import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ModelsNotice } from '../components/ModelsNotice.tsx';
import { NoticeStack } from '../components/Notices.tsx';
import { PrivacyBanner } from '../components/PrivacyBanner.tsx';
import { OpenNotificationSettings, TeachingToast } from '../components/TeachingToast.tsx';
import { SharedLibraryNotice } from '../components/SharedLibraryNotice.tsx';
import type { ScreenId } from '../screens/index.ts';
import { recall, remember } from '../lib/tab-memory.ts';
import { readStored, writeStored } from '../lib/stored-value.ts';
import { Sidebar } from './Sidebar.tsx';
import { TitleBar } from './TitleBar.tsx';
import styles from './AppShell.module.css';

interface AppShellProps {
  screenId: ScreenId;
  onSelectScreen(id: ScreenId): void;
  children: ReactNode;
}

const COLLAPSED_KEY = 'scrb.sidebar.collapsed';
/** At about half of a 1920 screen the sidebar shrinks to icons whatever the saved choice. */
const NARROW_QUERY = '(max-width: 1000px)';

function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(NARROW_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

export function AppShell({ screenId, onSelectScreen, children }: AppShellProps) {
  const workspace = useRef<HTMLElement>(null);
  const [chosenCollapsed, setChosenCollapsed] = useState(
    () => readStored<boolean>(COLLAPSED_KEY) === true,
  );
  const narrow = useNarrowWindow();
  const collapsed = chosenCollapsed || narrow;
  // Only the reader's own scrolling is remembered: the browser's clamping while a screen is
  // empty or still loading must not overwrite the place. This also covers every way of changing
  // screens, such as F1.
  const userScrolled = useRef(false);
  const noteUserScroll = () => {
    userScrolled.current = true;
  };
  // A screen's data can arrive after it opens, so the place is set once the content is tall
  // enough, for at most a few seconds and never after the reader has scrolled.
  useLayoutEffect(() => {
    const element = workspace.current;
    userScrolled.current = false;
    const saved = recall<number>(`scroll.${screenId}`) ?? 0;
    if (!element) return;
    element.scrollTop = saved;
    if (!saved) return;
    const place = () => {
      if (userScrolled.current) return;
      if (element.scrollHeight - element.clientHeight >= saved) element.scrollTop = saved;
    };
    place();
    const observer = new MutationObserver(place);
    observer.observe(element, { childList: true, subtree: true });
    const giveUp = setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      clearTimeout(giveUp);
    };
  }, [screenId]);

  const openNotificationSettings = () => {
    onSelectScreen('settings');
    // The Settings form loads its data first, so wait briefly for the section to exist.
    let tries = 0;
    const find = () => {
      const heading = document.getElementById('settings-notifications');
      if (heading) heading.scrollIntoView({ block: 'start' });
      else if (tries++ < 40) setTimeout(find, 50);
    };
    find();
  };

  return (
    <div className={styles.shell}>
      <TitleBar />
      <div className={styles.body}>
        <div
          className={collapsed ? `${styles.sidebar} ${styles.sidebarCollapsed}` : styles.sidebar}
        >
          <Sidebar
            selected={screenId}
            onSelect={onSelectScreen}
            collapsed={collapsed}
            canToggle={!narrow}
            onToggle={() => {
              setChosenCollapsed(!chosenCollapsed);
              writeStored(COLLAPSED_KEY, !chosenCollapsed);
            }}
          />
        </div>
        <div className={styles.workspaceFrame}>
          <NoticeStack className={styles.notices}>
            <SharedLibraryNotice />
            {screenId !== 'live' && <PrivacyBanner />}
            <ModelsNotice />
          </NoticeStack>
          {screenId !== 'live' && screenId !== 'recordings' && <TeachingToast />}
          <OpenNotificationSettings.Provider value={openNotificationSettings}>
            <main
              ref={workspace}
              className={styles.workspace}
              onScroll={(event) => {
                if (userScrolled.current)
                  remember(`scroll.${screenId}`, event.currentTarget.scrollTop);
              }}
              onWheel={noteUserScroll}
              onTouchMove={noteUserScroll}
              onPointerDown={noteUserScroll}
              onKeyDown={noteUserScroll}
            >
              {children}
            </main>
          </OpenNotificationSettings.Provider>
        </div>
      </div>
    </div>
  );
}
