import { useEffect, useRef, useState } from 'react';
import type { MeetingId, Speaker, TranscriptSegment } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { applyTranscriptChange, mergeSpeakers } from './transcript-model.ts';

const PAGE_SIZE = 1000;

export interface TranscriptData {
  segments: TranscriptSegment[];
  speakers: Speaker[];
  totalSegments: number;
  loading: boolean;
  error: string | null;
}

const EMPTY: TranscriptData = {
  segments: [],
  speakers: [],
  totalSegments: 0,
  loading: true,
  error: null,
};

/**
 * Loads every page in the background so jumps and gap markers can use the whole timeline, then
 * follows change events. `reloadKey` forces a fresh load, such as when the final pass ends.
 */
export function useTranscript(meetingId: MeetingId, reloadKey: string): TranscriptData {
  const backend = useBackend();
  const [data, setData] = useState(EMPTY);
  const [generation, setGeneration] = useState(0);
  const revision = useRef<number | null>(null);

  useEffect(() => {
    let current = true;
    revision.current = null;

    const loadAll = async () => {
      const segments: TranscriptSegment[] = [];
      let total = Number.POSITIVE_INFINITY;
      while (current && segments.length < total) {
        const page = await backend.call('getTranscript', {
          meetingId,
          offset: segments.length,
          limit: PAGE_SIZE,
        });
        if (!current) return;
        if (page.segments.length === 0) break;
        segments.push(...page.segments);
        total = page.totalSegments;
        revision.current = page.revision;
        const loaded = [...segments];
        const finished = loaded.length >= total;
        setData((previous) =>
          // A reload keeps showing the old text until the new text is complete.
          previous.segments.length > 0 && !finished
            ? previous
            : {
                segments: loaded,
                speakers: page.speakers,
                totalSegments: total,
                loading: !finished,
                error: null,
              },
        );
      }
      if (current && total === Number.POSITIVE_INFINITY) {
        setData({ ...EMPTY, loading: false });
      }
    };

    loadAll().catch((error: unknown) => {
      if (current) {
        setData({
          ...EMPTY,
          loading: false,
          error: error instanceof Error ? error.message : 'The transcript could not be loaded.',
        });
      }
    });

    const off = backend.on('transcriptChanged', (event) => {
      if (event.meetingId !== meetingId || revision.current === null) return;
      if (event.revision <= revision.current) return;
      if (event.revision !== revision.current + 1) {
        setGeneration((value) => value + 1);
        return;
      }
      revision.current = event.revision;
      setData((previous) => {
        const segments = applyTranscriptChange(previous.segments, event.change);
        return {
          ...previous,
          segments,
          speakers: mergeSpeakers(previous.speakers, event.speakers),
          totalSegments: segments.length,
        };
      });
    });

    return () => {
      current = false;
      off();
    };
  }, [backend, meetingId, reloadKey, generation]);

  return data;
}
