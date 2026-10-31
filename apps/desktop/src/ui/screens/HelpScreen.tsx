import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, Item, ItemList, Screen } from './Screen.tsx';

const load = (backend: Backend) => backend.call('getAppInfo');

export function HelpScreen() {
  const { state } = useBackendData(load);
  const { state: licenses } = useBackendData((backend: Backend) => backend.call('getLicenses'));
  return (
    <Screen title="Help">
      <p>The User Manual arrives with each phase and is finished in Phase 8.</p>
      <h2>About</h2>
      <DataView state={state}>
        {(info) => (
          <>
            <p>
              {info.name} {info.version}, built {info.buildDate}
            </p>
            <p>{info.copyright}</p>
            <p>{info.storageStatement}</p>
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
