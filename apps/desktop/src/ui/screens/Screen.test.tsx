import { act, cleanup, render, screen } from '@testing-library/react';
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

const withButton = (show: boolean, text: string) => (
  <Screen title="Example">
    {show && <button>Remove me</button>}
    <p>{text}</p>
  </Screen>
);

it('leaves focus on the body when the user clicked away', () => {
  const { rerender } = render(withButton(true, 'Before'));
  const button = screen.getByRole('button');
  button.focus();
  button.blur();
  rerender(withButton(true, 'After'));
  expect(document.activeElement).toBe(document.body);
});

it('moves focus to the heading when the focused control is removed', () => {
  const { rerender } = render(withButton(true, 'Before'));
  act(() => screen.getByRole('button').focus());
  rerender(withButton(false, 'After'));
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Example' }));
});
