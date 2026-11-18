import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BackendProvider } from '../lib/backend-context.tsx';
import { APP_INFO } from '../mocks/fixtures.ts';
import { MockBackend } from '../mocks/index.ts';
import { HelpScreen } from './HelpScreen.tsx';
import { numberedManualSections } from './help/manual-content.ts';

function show(backend: MockBackend) {
  return render(
    <BackendProvider backend={backend}>
      <HelpScreen />
    </BackendProvider>,
  );
}

describe('HelpScreen', () => {
  afterEach(cleanup);

  it('shows all fourteen bundled manual sections, troubleshooting and known issues', async () => {
    const backend = new MockBackend();
    show(backend);
    expect(numberedManualSections).toHaveLength(14);
    const nav = screen.getByRole('navigation', { name: 'Manual sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(17);
    expect(screen.getByRole('heading', { level: 3, name: 'Overview' })).toBeTruthy();
    fireEvent.click(within(nav).getByRole('link', { name: '14. Help and About' }));
    expect(screen.getByRole('heading', { level: 3, name: '14. Help and About' })).toBeTruthy();
    expect(screen.getByText(/searchable User Manual/)).toBeTruthy();
    fireEvent.click(within(nav).getByRole('link', { name: 'Troubleshooting' }));
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Check first' })).toBeTruthy();
    expect(
      await screen.findByText(new RegExp(APP_INFO.version.replace(/[().]/g, '\\$&'))),
    ).toBeTruthy();
    backend.dispose();
  });

  it('searches section titles and text regardless of case, then handles no results', () => {
    const backend = new MockBackend();
    show(backend);
    const search = screen.getByRole('searchbox', { name: 'Search user manual' });
    fireEvent.change(search, { target: { value: 'microsoft teams' } });
    const nav = screen.getByRole('navigation', { name: 'Manual sections' });
    expect(within(nav).getByRole('link', { name: 'Known issues' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: '13. Packaged app and Windows' })).toBeTruthy();
    fireEvent.click(within(nav).getByRole('link', { name: 'Known issues' }));
    expect(screen.getByText(/Every sound on that device is recorded/)).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nonexistent searchable phrase 4923' } });
    expect(screen.getByRole('status', { name: 'Manual search results' }).textContent).toBe(
      'No manual sections match your search.',
    );
    expect(screen.getByText('Try another word or phrase.')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(
      within(screen.getByRole('navigation', { name: 'Manual sections' })).getAllByRole('link'),
    ).toHaveLength(17);
    backend.dispose();
  });

  it('uses native keyboard-operable links and focuses the selected section heading', async () => {
    const backend = new MockBackend();
    show(backend);
    const link = within(screen.getByRole('navigation', { name: 'Manual sections' })).getByRole(
      'link',
      {
        name: '11. Delete and storage',
      },
    );
    expect(link.getAttribute('href')).toBe('#manual-section-11');
    link.focus();
    fireEvent.click(link);
    const heading = screen.getByRole('heading', { level: 3, name: '11. Delete and storage' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(link.getAttribute('aria-current')).toBe('location');
    expect(screen.getByText(/This is not secure erasure/)).toBeTruthy();
    backend.dispose();
  });

  it('keeps privacy and unimplemented-feature warnings visible without internet access', () => {
    const backend = new MockBackend();
    show(backend);
    fireEvent.click(screen.getByRole('link', { name: 'known-issues.md' }));
    expect(screen.getByText(/Every sound on that device is recorded/)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'User Manual' }));
    const nav = screen.getByRole('navigation', { name: 'Manual sections' });
    fireEvent.click(within(nav).getByRole('link', { name: '1. Before you start' }));
    expect(screen.getByText(/folder that is synced to the cloud/)).toBeTruthy();
    expect(screen.getByText(/not implemented/)).toBeTruthy();
    backend.dispose();
  });

  it('retains About and verified third-party notices without changing model inventory', async () => {
    const backend = new MockBackend();
    show(backend);
    expect(
      await screen.findByText(new RegExp(APP_INFO.version.replace(/[().]/g, '\\$&'))),
    ).toBeTruthy();
    expect(screen.getByText(/Scribe keeps your data on this computer/)).toBeTruthy();
    expect(screen.getByText(/development-only sources are not part of the app/)).toBeTruthy();
    expect(await screen.findByText(/Electron 45\.1\.0 \(MIT\)/)).toBeTruthy();
    backend.dispose();
  });

  it('says model details are not reported', async () => {
    const backend = new MockBackend();
    backend.arm('noModelInfo');
    show(backend);
    expect(
      await screen.findByText(/This build does not report installed model details/),
    ).toBeTruthy();
    backend.dispose();
  });
});
