import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockBackend } from '../mocks/index.ts';
import {
  noteOptionalDismiss,
  resetNotificationPrefs,
  setNotificationEnabled,
} from '../lib/notification-prefs.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';
import { TeachingToast } from './TeachingToast.tsx';

vi.mock('../shell/use-recording-status.ts', () => ({
  useRecordingStatus: () => ({
    recording: {
      status: 'recording',
      meetingId: 'synthetic-meeting-9',
      elapsedMs: 100,
      pauseReason: null,
      privacyBannerRequired: true,
    },
  }),
}));

const TEACHING = 'You can turn banners on or off in Settings > Notifications.';

describe('Notifications preferences', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetNotificationPrefs();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('hides a banner whose category is turned off, and shows it again when turned on', () => {
    const backend = new MockBackend();
    render(
      <BackendProvider backend={backend}>
        <PrivacyBanner />
      </BackendProvider>,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => setNotificationEnabled('privacy', false));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => setNotificationEnabled('privacy', true));
    expect(screen.getByRole('status')).toBeTruthy();
    backend.dispose();
  });

  it('points to Settings once, after the first dismissal, and hides itself after 8 seconds', () => {
    vi.useFakeTimers();
    const open = vi.fn();
    render(<TeachingToast onOpenSettings={open} />);
    expect(screen.queryByText(TEACHING)).toBeNull();
    act(() => noteOptionalDismiss());
    expect(screen.getByText(TEACHING)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByText(TEACHING)).toBeNull();
    act(() => noteOptionalDismiss());
    expect(screen.queryByText(TEACHING)).toBeNull();
  });

  it('opens Settings from the pointer and remembers it was shown', () => {
    const open = vi.fn();
    render(<TeachingToast onOpenSettings={open} />);
    act(() => noteOptionalDismiss());
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(TEACHING)).toBeNull();
    expect(window.localStorage.getItem('scrb.notifications')).toContain('"taught":true');
  });
});
