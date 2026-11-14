import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BackendProvider } from '../lib/backend-context.tsx';
import { APP_INFO } from '../mocks/fixtures.ts';
import { MockBackend } from '../mocks/index.ts';
import { HelpScreen } from './HelpScreen.tsx';

function show(backend: MockBackend) {
  return render(
    <BackendProvider backend={backend}>
      <HelpScreen />
    </BackendProvider>,
  );
}

describe('HelpScreen', () => {
  afterEach(cleanup);

  it('shows the name, version, data statement, credits and manual location', async () => {
    const backend = new MockBackend();
    show(backend);
    expect(
      await screen.findByText(new RegExp(`${APP_INFO.version.replace(/[().]/g, '\\$&')}`)),
    ).toBeTruthy();
    expect(screen.getByText(/All of your data stays on this computer/)).toBeTruthy();
    expect(screen.getByText(/development-only sources are not part of the app/)).toBeTruthy();
    expect(screen.getByText('docs/user-manual')).toBeTruthy();
    expect(await screen.findByText(/Electron 45\.1\.0 \(MIT\)/)).toBeTruthy();
    backend.dispose();
  });

  it('says model information is unavailable before models are downloaded', async () => {
    const backend = new MockBackend();
    backend.arm('noModelInfo');
    show(backend);
    expect(await screen.findByText(/Model information is unavailable/)).toBeTruthy();
    backend.dispose();
  });
});
