import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState, Item, ItemList, Screen } from './Screen.tsx';

const load = (backend: Backend) => backend.call('listProfiles');

export function SpeakersScreen() {
  const { state } = useBackendData(load);
  return (
    <Screen title="Speakers">
      <DataView state={state}>
        {(profiles) =>
          profiles.length === 0 ? (
            <EmptyState title="No voice profiles yet">
              Profiles appear after your first recording.
            </EmptyState>
          ) : (
            <ItemList>
              {profiles.map((profile) => (
                <Item
                  key={profile.id}
                  primary={profile.name ?? 'Unnamed voice'}
                  secondary={`${profile.meetingCount} meetings`}
                />
              ))}
            </ItemList>
          )
        }
      </DataView>
    </Screen>
  );
}
