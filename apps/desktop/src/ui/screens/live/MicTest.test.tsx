import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import { MicTest } from './MicTest.tsx';

const headset = {
  id: 'synthetic-headset',
  name: 'Invented headset',
  isSystemDefault: true,
  transport: 'bluetoothHandsFree' as const,
};

let backend: MockBackend;

beforeEach(() => {
  window.localStorage.clear();
  backend = new MockBackend();
});

afterEach(() => {
  cleanup();
  backend.dispose();
});

describe('mic test headset advisory', () => {
  it('warns before opening a hands-free microphone', () => {
    render(
      <BackendProvider backend={backend}>
        <MicTest
          sources={{ micDeviceId: headset.id, meetingAppId: 'whole-computer' }}
          devices={[headset]}
        />
      </BackendProvider>,
    );
    expect(screen.getByText(/Testing this headset turns on call mode/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test mic' })).toBeTruthy();
  });

  it('does not show the hands-free advisory for a built-in mic', () => {
    render(
      <BackendProvider backend={backend}>
        <MicTest
          sources={{ micDeviceId: null, meetingAppId: 'whole-computer' }}
          devices={[{ ...headset, transport: 'builtIn' }]}
        />
      </BackendProvider>,
    );
    expect(screen.queryByText(/call mode/)).toBeNull();
  });
});

describe('mic test during a recording', () => {
  it('is off, with the reason, while a recording is under way', async () => {
    await backend.call('startRecording', {});
    render(
      <BackendProvider backend={backend}>
        <MicTest
          sources={{ micDeviceId: null, meetingAppId: 'whole-computer' }}
          devices={[headset]}
        />
      </BackendProvider>,
    );
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Test mic' }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    expect(screen.getByText('Not available while recording.')).toBeTruthy();
  });
});

describe('MicTest layout', () => {
  it('keeps a fixed-size button and note slot, and Settings places it above the Preset', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, 'MicTest.module.css'), 'utf8');
    const rule = (name: string) => css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('testButton')).toMatch(/width: \d+px/);
    expect(rule('testNote')).toMatch(/height:/);
    const audio = readFileSync(join(__dirname, '../settings/AudioSection.tsx'), 'utf8');
    expect(audio.indexOf('<MicTest')).toBeGreaterThan(0);
    expect(audio.indexOf('<MicTest')).toBeLessThan(audio.search(/>\s*Preset\s*</));
  });
});

describe('mic test level meter', () => {
  it('shows the Live page mic meter beside the button and moves it while testing', async () => {
    render(
      <BackendProvider backend={backend}>
        <MicTest
          sources={{ micDeviceId: null, meetingAppId: 'whole-computer' }}
          devices={[headset]}
        />
      </BackendProvider>,
    );
    const meter = screen.getByRole('meter', { name: 'Mic level' });
    expect(screen.queryByRole('meter', { name: 'Meeting level' })).toBeNull();
    expect(meter.getAttribute('aria-valuenow')).toBe('-100');
    screen.getByRole('button', { name: 'Test mic' }).click();
    // The first sample is emitted before React commits the active subscription.
    // A later sample must move the meter once the mic test is active.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop test' })).toBeTruthy());
    act(() => backend.emit('levelMeter', { micDb: -24, meetingDb: null }));
    await waitFor(() => expect(meter.getAttribute('aria-valuenow')).toBe('-24'));
  });
});
