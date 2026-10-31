import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';
import { BackendProvider } from './lib/backend-context.tsx';
import { MockBackend } from './mocks/index.ts';
import { MOCK_SPEAKERS } from './mocks/transcript.ts';

let backend: MockBackend;

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const goTo = async (name: string) => {
  const nav = screen.getByRole('navigation', { name: 'Main' });
  fireEvent.click(within(nav).getByRole('button', { name }));
  await advance(0);
};
const firstWord = () => document.querySelector<HTMLElement>('[data-word-id]') as HTMLElement;

async function renderApp(usState: string | null = null) {
  await backend.call('updateSettings', { location: { country: 'US', usState } });
  render(
    <BackendProvider backend={backend}>
      <App />
    </BackendProvider>,
  );
  await advance(0);
}

async function startRecording(seconds = 3) {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await advance(seconds * 1000);
}

async function correctFirstWord(text: string) {
  const word = firstWord();
  fireEvent.mouseDown(word, { detail: 1 });
  fireEvent.mouseUp(word, { detail: 1 });
  fireEvent.doubleClick(word, { detail: 2 });
  await advance(0);
  fireEvent.change(screen.getByLabelText('Correct text'), { target: { value: text } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Remember correction' }));
  const form = screen.getByRole('form', { name: 'Correct transcript' });
  fireEvent.submit(form);
  await advance(0);
}

async function openMeeting(title: RegExp) {
  await goTo('Recordings');
  await advance(0);
  fireEvent.click(screen.getByRole('button', { name: title }));
  await advance(0);
}

describe('screens working together on the mock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    backend = new MockBackend();
  });

  afterEach(() => {
    cleanup();
    backend.dispose();
    vi.useRealTimers();
  });

  it('shows a Live correction in Recordings and Vocabulary, also after the final pass', async () => {
    await renderApp();
    await startRecording();
    await correctFirstWord('Halden');

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    await advance(0);
    await openMeeting(/Scripted live meeting/);
    expect(screen.getAllByText(/final pass/i).length).toBeGreaterThan(0);

    act(() => backend.finishFinalPass());
    await advance(3000);
    expect(screen.queryAllByText(/final pass/i)).toHaveLength(0);
    expect(screen.getByText('Halden')).toBeTruthy();

    await goTo('Vocabulary');
    expect(screen.getByText('Halden')).toBeTruthy();
  });

  it('flags a Recordings summary as outdated after a transcript edit', async () => {
    await renderApp();
    const meetingId = 'meeting-8h';
    await goTo('Recordings');
    expect(screen.getAllByText('May be outdated')).toHaveLength(1);

    const { segments } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
    const wordId = segments[0]?.words[0]?.id as string;
    await act(() =>
      backend.call('applyCorrection', {
        meetingId,
        range: { firstWordId: wordId, lastWordId: wordId },
        text: 'Halden',
        remember: false,
      }),
    );
    await advance(0);
    expect(screen.getAllByText('May be outdated')).toHaveLength(2);
  });

  it('shows one privacy banner on every screen, and a dismissal lasts across screens', async () => {
    await renderApp('IL');
    await startRecording(1);
    const banner = () => screen.queryAllByText(/Voice profiles are being built/);
    expect(banner()).toHaveLength(1);

    await goTo('Recordings');
    expect(banner()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Dismiss/ }));
    await goTo('Live');
    expect(banner()).toHaveLength(0);
  });

  it('shows a meeting speaker rename in the Recordings transcript', async () => {
    await renderApp();
    await act(() =>
      backend.call('renameSpeaker', {
        target: {
          kind: 'meetingSpeaker',
          meetingId: 'meeting-outdated',
          speakerId: MOCK_SPEAKERS[0]?.id as string,
        },
        name: 'Renamed Person',
      }),
    );
    await openMeeting(/Weekly project sync/);
    await advance(0);
    expect(screen.getAllByText('Renamed Person').length).toBeGreaterThan(0);
  });

  it('stops a Recordings import when Live starts recording', async () => {
    await renderApp();
    await goTo('Recordings');
    const { importId } = await backend.call('importAudioFile', {
      fileToken: 'file-1',
      buildVoiceProfiles: false,
    });
    expect(importId).toBeTruthy();
    await goTo('Live');
    await startRecording(1);
    await goTo('Recordings');
    expect(screen.getByText(/A recording started, so this import stopped/)).toBeTruthy();
  });
});
