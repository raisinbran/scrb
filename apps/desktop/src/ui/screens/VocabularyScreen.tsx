import type { Backend } from '@scrb/contracts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { DataView, EmptyState, Item, ItemList, Screen } from './Screen.tsx';

const load = (backend: Backend) => backend.call('listTerms');

export function VocabularyScreen() {
  const { state } = useBackendData(load);
  return (
    <Screen title="Vocabulary">
      <DataView state={state}>
        {(terms) =>
          terms.length === 0 ? (
            <EmptyState title="No terms yet">
              Corrections you choose to remember will appear here.
            </EmptyState>
          ) : (
            <ItemList>
              {terms.map((term) => (
                <Item
                  key={term.id}
                  primary={term.term}
                  secondary={term.enabled ? term.misheard.join(', ') : 'Disabled'}
                />
              ))}
            </ItemList>
          )
        }
      </DataView>
    </Screen>
  );
}
