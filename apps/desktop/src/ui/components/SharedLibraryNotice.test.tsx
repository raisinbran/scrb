import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { SharedLibraryNotice } from './SharedLibraryNotice.tsx';

afterEach(cleanup);

describe('SharedLibraryNotice', () => {
  it('shows a non-modal status and keeps the dismissal across a remount', async () => {
    let dismissed = false;
    const call = vi.fn(async (name: string) => {
      if (name === 'getSharedLibraryNotice') {
        return dismissed ? null : 'The library folder may be accessible to other people.';
      }
      if (name === 'dismissSharedLibraryNotice') dismissed = true;
      return undefined;
    });
    const backend = { call } as unknown as Backend;
    const first = render(
      <BackendProvider backend={backend}>
        <SharedLibraryNotice />
        <main>Live screen</main>
      </BackendProvider>,
    );

    const notice = await screen.findByRole('status');
    expect(notice.textContent).toContain('accessible to other people');
    expect(screen.getByRole('main').textContent).toBe('Live screen');
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss shared library/i }));
    });
    expect(screen.queryByRole('status')).toBeNull();
    first.unmount();

    render(
      <BackendProvider backend={backend}>
        <SharedLibraryNotice />
      </BackendProvider>,
    );
    await waitFor(() => expect(call).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole('status')).toBeNull();
    expect(call.mock.calls.map(([name]) => name)).toEqual([
      'getSharedLibraryNotice',
      'dismissSharedLibraryNotice',
      'getSharedLibraryNotice',
    ]);
  });
});
