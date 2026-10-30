import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, Item, ItemList, Screen } from './Screen.tsx';

const load = (backend: Backend) => backend.call('getAppInfo');

export function HelpScreen() {
  const { state } = useBackendData(load);
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
    </Screen>
  );
}
