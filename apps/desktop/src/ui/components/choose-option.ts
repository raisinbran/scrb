import { fireEvent, screen } from '@testing-library/react';

/** Test helper: open a SearchSelect by its label and pick one option. */
export async function chooseOption(field: string, option: string) {
  const box = await screen.findByRole('combobox', { name: field });
  fireEvent.focus(box);
  fireEvent.mouseDown(await screen.findByRole('option', { name: option }));
}
