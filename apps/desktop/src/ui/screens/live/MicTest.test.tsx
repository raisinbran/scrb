import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BackendProvider } from '../../lib/backend-context.tsx';
import { MockBackend } from '../../mocks/index.ts';
import { MicTest } from './MicTest.tsx';

const headset = {
  id: 'synthetic-headset',
  name: 'Invented headset',
  isSystemDefault: true,
  transport: 'bluetoothHandsFree' as const,
};

const backend = new MockBackend();

afterEach(() => cleanup());

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
