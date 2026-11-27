import { useMemo, useState } from 'react';
import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, Item, ItemList } from './Screen.tsx';
import { MANUAL_SECTIONS } from './help/manual-content.ts';
import { ManualText } from './help/ManualText.tsx';
import { SettingsNav, type SettingsGroup } from './settings/SettingsNav.tsx';
import { SplitLayout } from './SplitLayout.tsx';
import styles from './HelpScreen.module.css';

const load = (backend: Backend) => backend.call('getAppInfo');
const loadLicenses = (backend: Backend) => backend.call('getLicenses');

const EXTRA_GROUPS: SettingsGroup[] = [
  { id: 'help-models', label: 'How models are chosen' },
  { id: 'help-about', label: 'About' },
  { id: 'help-credits', label: 'Credits' },
  { id: 'help-notices', label: 'Third-party notices' },
];

export function HelpScreen() {
  const { state } = useBackendData(load);
  const { state: licenses } = useBackendData(loadLicenses);
  const [query, setQuery] = useState('');
  const term = query.trim().toLocaleLowerCase();
  const results = MANUAL_SECTIONS.filter(
    (section) =>
      !term || (section.title + ' ' + section.content).toLocaleLowerCase().includes(term),
  );
  // While searching, only the matching manual sections stay; the rest of the page returns after.
  const groups = useMemo<SettingsGroup[]>(
    () => [
      ...results.map((section) => ({ id: 'manual-' + section.id, label: section.title })),
      ...(term ? [] : EXTRA_GROUPS),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [term],
  );

  const jumpTo = (id: string) => {
    setQuery('');
    requestAnimationFrame(() => {
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      document
        .getElementById('manual-' + id)
        ?.scrollIntoView?.({ behavior: reduced ? 'instant' : 'smooth', block: 'start' });
    });
  };

  return (
    <SplitLayout
      title="Help"
      titleAction={
        <input
          type="search"
          className={styles.search}
          aria-label="Search help"
          placeholder="Search help"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
      list={
        groups.length > 0 ? (
          <SettingsNav
            key={groups.map((group) => group.id).join()}
            groups={groups}
            label="Manual sections"
          />
        ) : null
      }
    >
      <div className={styles.page}>
        {term && (
          <p role="status" aria-label="Manual search results" className={styles.status}>
            {results.length === 0
              ? 'No manual sections match your search.'
              : results.length + (results.length === 1 ? ' section found.' : ' sections found.')}
          </p>
        )}
        {results.length === 0 && <p className={styles.noResults}>Try another word or phrase.</p>}
        {results.map((section) => (
          <section
            key={section.id}
            className={styles.topic}
            aria-labelledby={'manual-' + section.id}
          >
            <h2 id={'manual-' + section.id} className={styles.topicTitle}>
              {section.title}
            </h2>
            <div className={styles.article}>
              <ManualText content={section.content} onNavigate={jumpTo} />
            </div>
          </section>
        ))}
        {!term && (
          <>
            <section className={styles.topic} aria-labelledby="help-models">
              <h2 id="help-models" className={styles.topicTitle}>
                How models are chosen for this computer
              </h2>
              <p>
                When Scribe is first set up, it checks your computer's memory and processor cores
                and picks a Performance setting for you: Fast on computers with under 8 GB of memory
                or under 4 cores, otherwise Balanced. Best quality is never picked for you, because
                it uses the most power. You can change it in Settings at any time, and Scribe never
                changes a choice you have made. Scribe does not yet time your computer to pick
                models, and each kind of model currently comes in one version.
              </p>
            </section>
            <section className={styles.topic} aria-labelledby="help-about">
              <h2 id="help-about" className={styles.topicTitle}>
                About
              </h2>
              <DataView state={state}>
                {(info) => (
                  <>
                    <p>
                      {info.name} {info.version}, built {info.buildDate}
                    </p>
                    <p>{info.copyright}</p>
                    <p>{info.storageStatement}</p>
                    <p>
                      Scribe keeps your data on this computer and does not upload it. If you choose
                      a library folder on a cloud-synced drive, that service may upload the files.
                    </p>
                    {info.models.length === 0 ? (
                      <p>This build does not report installed model details.</p>
                    ) : (
                      <ItemList>
                        {info.models.map((model) => (
                          <Item key={model.role} primary={model.name} secondary={model.version} />
                        ))}
                      </ItemList>
                    )}
                  </>
                )}
              </DataView>
            </section>
            <section className={styles.topic} aria-labelledby="help-credits">
              <h2 id="help-credits" className={styles.topicTitle}>
                Credits
              </h2>
              <p>
                Scribe includes third-party software. Only notices that have been verified for this
                build are listed below; the project's development-only sources are not part of the
                app.
              </p>
            </section>
            <section className={styles.topic} aria-labelledby="help-notices">
              <h2 id="help-notices" className={styles.topicTitle}>
                Third-party notices
              </h2>
              <DataView state={licenses}>
                {(entries) =>
                  entries.length === 0 ? (
                    <p>Verified third-party notices are not yet available in this build.</p>
                  ) : (
                    <ItemList>
                      {entries.map((entry) => (
                        <Item
                          key={`${entry.name}-${entry.version}`}
                          primary={`${entry.name} ${entry.version} (${entry.license})`}
                          secondary={entry.text}
                        />
                      ))}
                    </ItemList>
                  )
                }
              </DataView>
            </section>
          </>
        )}
      </div>
    </SplitLayout>
  );
}
