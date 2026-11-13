import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { MockModeProvider } from '../lib/mock-mode.tsx';
import { TitleBar } from './TitleBar.tsx';

const backend = {
  call: () => new Promise(() => undefined),
  on: () => () => undefined,
} as unknown as Backend;

function show(mock: boolean) {
  render(
    <BackendProvider backend={backend}>
      <MockModeProvider mock={mock}>
        <TitleBar />
      </MockModeProvider>
    </BackendProvider>,
  );
}

describe('TitleBar mock marker', () => {
  afterEach(cleanup);
  it('shows when the backend is a mock', () => {
    show(true);
    expect(screen.getByTestId('mock-backend-marker').textContent).toBe('Mock backend');
  });
  it('is absent in real mode', () => {
    show(false);
    expect(screen.queryByTestId('mock-backend-marker')).toBeNull();
  });
});
