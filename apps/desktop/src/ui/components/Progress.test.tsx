import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Progress } from './Progress.tsx';

describe('Progress', () => {
  afterEach(cleanup);

  it('fills to the reported fraction', () => {
    render(<Progress label="Importing" fraction={0.4} />);
    const bar = screen.getByRole('progressbar', { name: 'Importing' });
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('40%');
  });

  it('keeps out-of-range values inside the track', () => {
    render(<Progress label="Over" fraction={3} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('claims no position when none is reported', () => {
    render(<Progress label="Working" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  });
});
