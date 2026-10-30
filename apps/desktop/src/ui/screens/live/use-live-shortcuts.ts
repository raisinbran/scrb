import { useEffect, useRef } from 'react';

interface LiveShortcuts {
  onStartStop(): void;
  onPauseResume(): void;
  onJumpToLive(): void;
  onUndo(): void;
  onRedo(): void;
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Default shortcuts, with Ctrl on Windows and Cmd on macOS: Shift+S start/stop, Shift+P
 * pause/resume, Shift+L jump to live, Z undo, Shift+Z or Y redo. Undo and redo leave text fields
 * to their native editing.
 */
export function useLiveShortcuts(shortcuts: LiveShortcuts): void {
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      let action: (() => void) | undefined;
      if (event.shiftKey && key === 's') action = latest.current.onStartStop;
      else if (event.shiftKey && key === 'p') action = latest.current.onPauseResume;
      else if (event.shiftKey && key === 'l') action = latest.current.onJumpToLive;
      else if (!isTextField(event.target)) {
        if (key === 'z') action = event.shiftKey ? latest.current.onRedo : latest.current.onUndo;
        else if (key === 'y' && !event.shiftKey) action = latest.current.onRedo;
      }
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
