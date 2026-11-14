import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PrivacyBanner } from '../components/PrivacyBanner.tsx';
import type { ScreenId } from '../screens/index.ts';
import { recall, remember } from '../lib/tab-memory.ts';
import { usePanelSize, type PanelLimits } from '../lib/use-panel-size.ts';
import { ResizeHandle } from './ResizeHandle.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TitleBar } from './TitleBar.tsx';
import styles from './AppShell.module.css';

const SIDEBAR_LIMITS: PanelLimits = { min: 160, max: 320, initial: 200 };

interface AppShellProps {
  screenId: ScreenId;
  settingsOpen: boolean;
  onSelectScreen(id: ScreenId): void;
  onOpenSettings(): void;
  children: ReactNode;
}

export function AppShell({
  screenId,
  settingsOpen,
  onSelectScreen,
  onOpenSettings,
  children,
}: AppShellProps) {
  const [sidebarWidth, setSidebarWidth] = usePanelSize('scrb.sidebar.width', SIDEBAR_LIMITS);

  const workspace = useRef<HTMLElement>(null);
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

  return (
    <div className={styles.shell}>
      <TitleBar />
      <PrivacyBanner />
      <div className={styles.body}>
        <div className={styles.sidebar} style={{ width: sidebarWidth }}>
          <Sidebar
            selected={screenId}
            settingsOpen={settingsOpen}
            onSelect={onSelectScreen}
            onOpenSettings={onOpenSettings}
          />
        </div>
        <ResizeHandle
          label="Resize sidebar"
          size={sidebarWidth}
          min={SIDEBAR_LIMITS.min}
          max={SIDEBAR_LIMITS.max}
          direction={1}
          onResize={setSidebarWidth}
        />
        <main
          ref={workspace}
          className={styles.workspace}
          onScroll={(event) => {
            if (userScrolled.current) remember(`scroll.${screenId}`, event.currentTarget.scrollTop);
          }}
          onWheel={noteUserScroll}
          onTouchMove={noteUserScroll}
          onPointerDown={noteUserScroll}
          onKeyDown={noteUserScroll}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
