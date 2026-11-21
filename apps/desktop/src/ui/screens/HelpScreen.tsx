import { useEffect, useRef, useState } from 'react';
import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, Item, ItemList, Screen } from './Screen.tsx';
import { MANUAL_SECTIONS } from './help/manual-content.ts';
import { ManualText } from './help/ManualText.tsx';
import styles from './HelpScreen.module.css';

const load = (backend: Backend) => backend.call('getAppInfo');
const loadLicenses = (backend: Backend) => backend.call('getLicenses');

export function HelpScreen() {
  const { state } = useBackendData(load);
  const { state: licenses } = useBackendData(loadLicenses);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('overview');
  const manualHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterNavigation = useRef(false);
  const term = query.trim().toLocaleLowerCase();
  const results = MANUAL_SECTIONS.filter(
    (section) =>
      !term || (section.title + ' ' + section.content).toLocaleLowerCase().includes(term),
  );
  const active = results.find((section) => section.id === selected) ?? results[0];

  useEffect(() => {
    if (!focusAfterNavigation.current || !active) return;
    focusAfterNavigation.current = false;
    manualHeading.current?.focus();
  }, [active?.id]);

  const openSection = (id: string, clearSearch = false) => {
    focusAfterNavigation.current = true;
    if (clearSearch) setQuery('');
    setSelected(id);
    if (active?.id === id) {
      focusAfterNavigation.current = false;
      manualHeading.current?.focus();
    }
  };

  return (
    <Screen title="Help">
      <section className={styles.manual} aria-labelledby="manual-title">
        <h2 id="manual-title">User manual</h2>
        <label className={styles.searchLabel} htmlFor="manual-search">
          Search user manual
        </label>
        <input
          id="manual-search"
          className={styles.search}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {term && (
          <p role="status" aria-label="Manual search results" className={styles.status}>
            {results.length === 0
              ? 'No manual sections match your search.'
              : results.length + (results.length === 1 ? ' section found.' : ' sections found.')}
          </p>
        )}
        {active ? (
          <div className={styles.manualLayout}>
            <nav aria-label="Manual sections">
              <ul className={styles.contents}>
                {results.map((section) => (
                  <li key={section.id}>
                    <a
                      className={styles.sectionLink}
                      href={'#manual-' + section.id}
                      aria-current={section.id === active.id ? 'location' : undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        openSection(section.id);
                      }}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <article className={styles.article} aria-labelledby={'manual-' + active.id}>
              <h3
                id={'manual-' + active.id}
                className={styles.articleTitle}
                ref={manualHeading}
                tabIndex={-1}
              >
                {active.title}
              </h3>
              <ManualText content={active.content} onNavigate={(id) => openSection(id, true)} />
            </article>
          </div>
        ) : (
          <p className={styles.noResults}>Try another word or phrase.</p>
        )}
      </section>
      <h2>How models are chosen for this computer</h2>
      <p>
        When Scribe is first set up, it checks your computer's memory and processor cores and picks
        a Performance setting for you: Fast on computers with under 8 GB of memory or under 4 cores,
        otherwise Balanced. Best quality is never picked for you, because it uses the most power.
        You can change it in Settings at any time, and Scribe never changes a choice you have made.
        Scribe does not yet time your computer to pick models, and each kind of model currently
        comes in one version.
      </p>
      <h2>About</h2>
      <DataView state={state}>
        {(info) => (
          <>
            <p>
              {info.name} {info.version}, built {info.buildDate}
            </p>
            <p>{info.copyright}</p>
            <p>{info.storageStatement}</p>
            <p>
              Scribe keeps your data on this computer and does not upload it. If you choose a
              library folder on a cloud-synced drive, that service may upload the files.
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
      <h2>Credits</h2>
      <p>
        Scribe includes third-party software. Only notices that have been verified for this build
        are listed below; the project's development-only sources are not part of the app.
      </p>
      <h2>Third-party notices</h2>
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
    </Screen>
  );
}
