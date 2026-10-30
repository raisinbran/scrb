import { describe, expect, it } from 'vitest';
import type { AutoDeleteSettings } from '@scrb/storage';
import { createSettingsHandlers, type SettingsBackingStore } from './settings.ts';

function memoryStore(initial: Record<string, unknown> = {}): SettingsBackingStore {
  const values = new Map(Object.entries(initial));
  let autoDelete: AutoDeleteSettings = { period: 'never', scope: 'audio' };
  return {
    get: <T>(key: string, fallback: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    set: (key, value) => values.set(key, value),
    getAutoDelete: () => autoDelete,
    setAutoDelete: (next) => {
      autoDelete = next;
    },
  };
}

describe('settings handlers', () => {
  it('starts from defaults, with the location unset until first launch', () => {
    const settings = createSettingsHandlers(memoryStore(), '/lib').getSettings();
    expect(settings.theme).toBe('system');
    expect(settings.location).toEqual({ country: null, usState: null });
    expect(settings.storageLocation).toBe('/lib');
    expect(settings.autoDelete).toEqual({ period: 'never', scope: 'audioOnly' });
  });

  it('keeps a change across new handlers on the same store', () => {
    const store = memoryStore();
    createSettingsHandlers(store, '/lib').updateSettings({ theme: 'dark', transcriptFontPx: 18 });
    const reopened = createSettingsHandlers(store, '/lib').getSettings();
    expect(reopened.theme).toBe('dark');
    expect(reopened.transcriptFontPx).toBe(18);
  });

  it('merges nested groups without losing their other values', () => {
    const { updateSettings } = createSettingsHandlers(memoryStore(), '/lib');
    updateSettings({ audio: { echoCancellation: false } });
    updateSettings({ location: { country: 'US' } });
    const settings = updateSettings({ audio: { preset: 'studio' }, location: { usState: 'IL' } });
    expect(settings.audio.echoCancellation).toBe(false);
    expect(settings.audio.preset).toBe('studio');
    expect(settings.location).toEqual({ country: 'US', usState: 'IL' });
  });

  it('translates auto-delete scope and keeps the other half of a change', () => {
    const store = memoryStore();
    const { updateSettings } = createSettingsHandlers(store, '/lib');
    updateSettings({ autoDelete: { period: '90d' } });
    const settings = updateSettings({ autoDelete: { scope: 'wholeMeeting' } });
    expect(settings.autoDelete).toEqual({ period: '90d', scope: 'wholeMeeting' });
    expect(store.getAutoDelete()).toEqual({ period: '90d', scope: 'meeting' });
  });

  it('never moves the library through a settings change', () => {
    const { updateSettings } = createSettingsHandlers(memoryStore(), '/lib');
    expect(updateSettings({ storageLocation: '/elsewhere' }).storageLocation).toBe('/lib');
  });

  it('fills a key missing from older saved settings', () => {
    const store = memoryStore({ 'app.settings': { theme: 'light' } });
    const settings = createSettingsHandlers(store, '/lib').getSettings();
    expect(settings.theme).toBe('light');
    expect(settings.summaryDefaultLength).toBe('brief');
  });

  it.each([['not an object'], [{ theme: 'neon' }], [null]])(
    'falls back to defaults for damaged settings: %j',
    (damaged) => {
      const store = memoryStore({ 'app.settings': damaged });
      expect(createSettingsHandlers(store, '/lib').getSettings().theme).toBe('system');
    },
  );
});
