import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, Item, ItemList, Screen } from './Screen.tsx';

/** Components named in third_party/THIRD_PARTY_NOTICES.md that Scribe uses. */
const CREDITS = [
  'whisper.cpp (MIT)',
  'sherpa-onnx (Apache-2.0)',
  'Electron (MIT)',
  'React (MIT)',
  'Microsoft Windows audio capture samples (Microsoft sample license)',
];

const load = (backend: Backend) => backend.call('getAppInfo');
const loadLicenses = (backend: Backend) => backend.call('getLicenses');

export function HelpScreen() {
  const { state } = useBackendData(load);
  const { state: licenses } = useBackendData(loadLicenses);
  return (
    <Screen title="Help">
      <h2>User Manual</h2>
      <p>
        The User Manual is in the <code>docs/user-manual</code> folder of the Scribe project, with
        a Known issues page. It is not shown inside the app.
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
            <p>All of your data stays on this computer. Scribe does not upload it anywhere.</p>
            {info.models.length === 0 ? (
              <p>Model information is unavailable until models are downloaded.</p>
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
        Scribe is built with these open-source components: {CREDITS.join(', ')}. The full notices
        are listed below when this build includes them.
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
