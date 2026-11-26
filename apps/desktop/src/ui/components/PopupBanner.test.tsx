import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PopupBanner, PopupLayer } from './PopupBanner.tsx';

afterEach(cleanup);

describe('PopupBanner', () => {
  it('uses the given role and dismisses', () => {
    const onDismiss = vi.fn();
    render(
      <PopupLayer>
        <PopupBanner role="alert" onDismiss={onDismiss}>
          <p>Something failed</p>
        </PopupBanner>
      </PopupLayer>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Something failed');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows no dismiss button when it cannot be dismissed', () => {
    render(
      <PopupLayer>
        <PopupBanner>
          <p>Deleting</p>
        </PopupBanner>
      </PopupLayer>,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
