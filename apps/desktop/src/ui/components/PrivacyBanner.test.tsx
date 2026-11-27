import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockBackend } from '../mocks/index.ts';
import { PrivacyBanner } from './PrivacyBanner.tsx';

vi.mock('../shell/use-recording-status.ts', () => ({
  useRecordingStatus: () => ({
    recording: {
      status: 'recording',
      meetingId: 'synthetic-meeting-1',
      elapsedMs: 100,
      pauseReason: null,
      privacyBannerRequired: true,
    },
  }),
}));

describe('PrivacyBanner accessibility', () => {
  it('offers a descriptive keyboard-operable dismissal', () => {
    const backend = new MockBackend();
    render(
      <BackendProvider backend={backend}>
        <PrivacyBanner />
      </BackendProvider>,
    );
    const button = screen.getByRole('button', {
      name: 'Dismiss voice-profile privacy reminder for this recording',
    });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('status')).toBeNull();
    backend.dispose();
  });
});
