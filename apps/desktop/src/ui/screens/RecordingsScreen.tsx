import type { Backend } from '@scrb/contracts';
import { formatDuration, formatMeetingDate } from '../lib/format.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState, Item, ItemList, Screen } from './Screen.tsx';

const load = (backend: Backend) => backend.call('listMeetings', {});

export function RecordingsScreen() {
  const { state } = useBackendData(load);
  return (
    <Screen title="Recordings">
      <DataView state={state}>
        {(meetings) =>
          meetings.length === 0 ? (
            <EmptyState title="No recordings yet">
              Meetings you record or import will appear here.
            </EmptyState>
          ) : (
            <ItemList>
              {meetings.map((meeting) => (
                <Item
                  key={meeting.id}
                  primary={meeting.title}
                  secondary={`${formatMeetingDate(meeting.startedAt)} · ${formatDuration(meeting.durationMs)}`}
                />
              ))}
            </ItemList>
          )
        }
      </DataView>
    </Screen>
  );
}
