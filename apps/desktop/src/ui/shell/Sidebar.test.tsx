import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Backend, EventName, MeetingListItem } from '@scrb/contracts';
import { BackendProvider } from '../lib/backend-context.tsx';
import { Sidebar } from './Sidebar.tsx';

afterEach(cleanup);

const meeting = (status: MeetingListItem['status']): MeetingListItem => ({
  id: 'm1',
  title: 'Invented',
  startedAt: '2026-11-14T10:00:00Z',
  durationMs: 1000,
  origin: 'recorded',
  status,
  summaryState: 'notGenerated',
  speakerCount: 1,
});

function fake(list: MeetingListItem[], late?: { release: () => void }) {
  const listeners = new Map<EventName, ((payload: never) => void)[]>();
  const backend = {
    call: (name: string) =>
      name === 'listMeetings'
        ? late
          ? new Promise((resolve) => {
              late.release = () => resolve(list);
            })
          : Promise.resolve(list)
        : new Promise(() => undefined),
    on: (name: EventName, listener: (payload: never) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
      return () => undefined;
    },
  } as unknown as Backend;
  return {
    backend,
    emit: (name: EventName, payload: unknown) =>
      listeners.get(name)?.forEach((listener) => listener(payload as never)),
  };
}

describe('Recordings disc', () => {
  it('spins and is named only while a recording is being processed', async () => {
    const f = fake([meeting('finalPassRunning')]);
    await act(async () => {
      render(
        <BackendProvider backend={f.backend}>
          <Sidebar selected="live" onSelect={() => undefined} />
        </BackendProvider>,
      );
    });
    expect(
      screen.getByRole('button', { name: /^Recordings$/ }).getAttribute('aria-describedby'),
    ).toBe('recordings-processing');
    expect(screen.getByText('Background work pending')).toBeTruthy();
    act(() => f.emit('meetingChanged', meeting('ready')));
    expect(screen.queryByText('Background work pending')).toBeNull();
  });

  it('ignores an older list answer that arrives after a newer status event', async () => {
    const late = { release: () => undefined };
    const f = fake([meeting('finalPassRunning')], late);
    await act(async () => {
      render(
        <BackendProvider backend={f.backend}>
          <Sidebar selected="live" onSelect={() => undefined} />
        </BackendProvider>,
      );
    });
    act(() => f.emit('meetingChanged', meeting('ready')));
    await act(async () => late.release());
    expect(screen.queryByText('Background work pending')).toBeNull();
  });

  it('does not describe sample processing as real work, but reports real work on any tab', async () => {
    const mixed = fake([meeting('finalPassRunning')]);
    const real = fake([meeting('ready')]);
    await act(async () => {
      render(
        <BackendProvider backend={mixed.backend} processingBackend={real.backend}>
          <Sidebar selected="settings" onSelect={() => undefined} />
        </BackendProvider>,
      );
    });
    const recordings = screen.getByRole('button', { name: 'Recordings' });
    expect(recordings.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Background work pending')).toBeNull();
    act(() => mixed.emit('meetingChanged', meeting('finalPassRunning')));
    expect(recordings.getAttribute('aria-describedby')).toBeNull();

    act(() => real.emit('meetingChanged', meeting('finalPassRunning')));
    expect(recordings.getAttribute('aria-describedby')).toBe('recordings-processing');
    expect(screen.getByText('Background work pending')).toBeTruthy();
    recordings.focus();
    expect(document.activeElement).toBe(recordings);

    act(() => real.emit('meetingChanged', meeting('transcriptionFailed')));
    expect(recordings.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Background work pending')).toBeNull();
    expect(document.activeElement).toBe(recordings);
  });

  it('keeps the disc still when motion is reduced, and always shows the dot while processing', () => {
    const css = readFileSync(join(__dirname, 'Sidebar.module.css'), 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^@]*\.spin \{\s*animation: none/);
    expect(css).not.toMatch(/\.badge \{\s*display: none/);
    expect(css).not.toMatch(/\.spin \{[^}]*color:/);
  });
});

describe('Sidebar footer buttons', () => {
  it('are borderless and share the sidebar items hover and selected fills', () => {
    const css = readFileSync(join(__dirname, 'Sidebar.module.css'), 'utf8');
    const rule = (selector: string) =>
      css.match(new RegExp(`${selector.replace(/[.[\]'=()]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.iconButton')).toMatch(/border: 0/);
    expect(rule('.iconButton')).toMatch(/border-radius: var\(--radius\)/);
    expect(rule('.iconButton')).toMatch(/text-decoration: none/);
    expect(rule('.iconButton')).toMatch(/box-shadow: none/);
    expect(css).toMatch(/\.iconButton:focus:not\(:focus-visible\)\s*\{\s*outline: none/);
    expect(rule('.iconButton:hover')).toMatch(/--color-surface-hover/);
    expect(css).toMatch(
      /\.iconButton\[aria-current='page'\],\s*\.iconButton\[aria-expanded='true'\] \{[^}]*--color-surface-selected/,
    );
  });
});
