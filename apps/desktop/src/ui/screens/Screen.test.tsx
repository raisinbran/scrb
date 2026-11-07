import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Screen } from './Screen.tsx';

afterEach(cleanup);

it('preserves a present control across renders', () => {
  const view = (text: string) => (
    <Screen title="Example">
      <input aria-label="Name" />
      <p>{text}</p>
    </Screen>
  );
  const { rerender } = render(view('Before'));
  const input = screen.getByLabelText('Name');
  input.focus();
  rerender(view('After'));
  expect(document.activeElement).toBe(input);
});
