import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SpeakerSuggestion } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';

interface SuggestionsValue {
  suggestions: SpeakerSuggestion[];
  answer(suggestion: SpeakerSuggestion, accepted: boolean): Promise<void>;
}

const SuggestionsContext = createContext<SuggestionsValue | null>(null);

const sameSpeaker = (a: SpeakerSuggestion, b: SpeakerSuggestion) =>
  a.meetingId === b.meetingId && a.speakerId === b.speakerId;

/**
 * Mounted above the screens because `speakerSuggestion` is only an event: a suggestion that
 * arrives with nothing listening is lost, and the contract has no call to list pending ones.
 */
export function SpeakerSuggestionsProvider({ children }: { children: ReactNode }) {
  const backend = useBackend();
  const [suggestions, setSuggestions] = useState<SpeakerSuggestion[]>([]);

  useEffect(
    () =>
      backend.on('speakerSuggestion', (incoming) =>
        setSuggestions((current) => [
          ...current.filter((suggestion) => !sameSpeaker(suggestion, incoming)),
          incoming,
        ]),
      ),
    [backend],
  );

  const answer = useCallback(
    async (suggestion: SpeakerSuggestion, accepted: boolean) => {
      const { meetingId, speakerId, profileId } = suggestion;
      await backend.call('answerSpeakerSuggestion', { meetingId, speakerId, profileId, accepted });
      setSuggestions((current) => current.filter((item) => !sameSpeaker(item, suggestion)));
    },
    [backend],
  );

  const value = useMemo(() => ({ suggestions, answer }), [suggestions, answer]);
  return <SuggestionsContext.Provider value={value}>{children}</SuggestionsContext.Provider>;
}

export function useSpeakerSuggestions(): SuggestionsValue {
  const value = useContext(SuggestionsContext);
  if (!value) throw new Error('useSpeakerSuggestions must be used inside its provider');
  return value;
}
