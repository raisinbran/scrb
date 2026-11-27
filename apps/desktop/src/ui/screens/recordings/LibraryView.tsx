import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { matchesMeetingFilter } from '@scrb/contracts';
import type {
  Backend,
  FinalPassProgress,
  MeetingFilter,
  PickedAudioFile,
  SearchResult,
} from '@scrb/contracts';
import list from '../../components/ListItem.module.css';
import { Progress } from '../../components/Progress.tsx';
import { PlayingIndicator } from '../../components/PlayingIndicator.tsx';
import { useNowPlaying } from '../../lib/playback-context.tsx';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatDuration, formatElapsed, formatMeetingWhen } from '../../lib/format.ts';
import { useRemembered } from '../../lib/tab-memory.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView, EmptyState } from '../Screen.tsx';
import { SplitLayout } from '../SplitLayout.tsx';
import { Highlight } from './highlight.tsx';
import { nextProgress } from './ProcessingBanner.tsx';
import { ImportDialog, ImportPanel } from './ImportPanel.tsx';
import { STATUS_LABELS, SUMMARY_STATE_LABELS } from './labels.ts';
import styles from './recordings.module.css';

const SEARCH_DELAY_MS = 200;

type Origin = NonNullable<MeetingFilter['origin']> | '';

interface RowProps {
  result: SearchResult;
  query: string;
  selected: boolean;
  onOpen(id: string, atMs?: number): void;
}

/** A small bar under a meeting whose final transcript is processing; indeterminate until the first report. */
function RowProgress({ meetingId, title }: { meetingId: string; title: string }) {
  const backend = useBackend();
  const [progress, setProgress] = useState<FinalPassProgress | null>(null);
  useEffect(
    () =>
      backend.on('finalPassProgress', (report) => {
        if (report.meetingId === meetingId) setProgress((current) => nextProgress(current, report));
      }),
    [backend, meetingId],
  );
  return (
    <div className={styles.rowProgress}>
      <Progress label={`Final transcript processing: ${title}`} fraction={progress?.fraction} />
    </div>
  );
}

function MeetingRow({ result: { meeting, matches }, query, selected, onOpen }: RowProps) {
  const playing = useNowPlaying() === meeting.id;
  const status = STATUS_LABELS[meeting.status];
  const summary = SUMMARY_STATE_LABELS[meeting.summaryState];
  const snippets = matches.filter((match) => match.snippet !== null && match.startMs !== null);
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={`${styles.rowMain} ${list.item}`}
        aria-current={selected ? 'true' : undefined}
        disabled={meeting.status === 'deleting'}
        onClick={() => onOpen(meeting.id)}
      >
        <span className={styles.rowTitle}>
          <Highlight text={meeting.title} query={query} />
          {playing && <PlayingIndicator className={styles.rowPlaying} />}
        </span>
        <span className={styles.muted}>
          {formatMeetingWhen(meeting.startedAt)} · {formatDuration(meeting.durationMs)}
        </span>
        <span
          className={`${styles.rowStatus} ${meeting.status === 'finalPassRunning' ? styles.rowStatusBusy : ''}`}
        >
          <span className={styles.muted}>
            {meeting.speakerCount === 1 ? '1 speaker' : `${meeting.speakerCount} speakers`}
          </span>
          {meeting.origin === 'imported' && <span className={styles.badge}>Imported</span>}
          {status && <span className={styles.badgeStrong}>{status}</span>}
          {summary && (
            <span
              className={meeting.summaryState === 'outdated' ? styles.badgeWarning : styles.badge}
            >
              {summary}
            </span>
          )}
        </span>
      </button>
      {meeting.status === 'finalPassRunning' && (
        <RowProgress meetingId={meeting.id} title={meeting.title} />
      )}
      {snippets.map((match) => (
        <button
          key={`${match.segmentId ?? 'index'}-${match.startMs ?? 'none'}`}
          type="button"
          className={styles.snippet}
          onClick={() => onOpen(meeting.id, match.startMs as number)}
        >
          <span className={styles.time}>{formatElapsed(match.startMs as number)}</span>
          <span>
            <Highlight text={match.snippet as string} query={query} />
          </span>
        </button>
      ))}
    </li>
  );
}

interface LibraryViewProps {
  notice: string | null;
  /** The open meeting, marked in the list. */
  selectedId: string | null;
  /** The content panel beside the list. */
  children: ReactNode;
  onOpen(id: string, atMs?: number): void;
}

export function LibraryView({ notice, selectedId, onOpen, children }: LibraryViewProps) {
  const backend = useBackend();
  const searchBox = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useRemembered('library.typed', '');
  const [query, setQuery] = useState(() => typed.trim());
  const [origin, setOrigin] = useRemembered<Origin>('library.origin', '');
  const [from, setFrom] = useRemembered('library.from', '');
  const [to, setTo] = useRemembered('library.to', '');
  const [picked, setPicked] = useState<PickedAudioFile | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchBox.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const load = useCallback(
    async (client: Backend): Promise<SearchResult[]> => {
      const filter: MeetingFilter = {
        ...(origin && { origin }),
        ...(from && { from }),
        ...(to && { to }),
      };
      if (query) {
        const results = await client.call('searchMeetings', { query });
        return results.filter((result) => matchesMeetingFilter(result.meeting, filter));
      }
      const meetings = await client.call('listMeetings', { filter });
      return meetings.map((meeting) => ({ meeting, matches: [] }));
    },
    [query, origin, from, to],
  );
  const { state, reload } = useBackendData(load);

  // The list stays beside the meeting, so closing one (or deleting it) refreshes the list.
  const lastSelected = useRef(selectedId);
  useEffect(() => {
    if (lastSelected.current !== null && selectedId === null) reload();
    lastSelected.current = selectedId;
  }, [selectedId, reload]);

  useEffect(() => {
    let status: string | undefined;
    const stops = [
      backend.on('importFinished', reload),
      backend.on('summaryOutdated', reload),
      backend.on('summaryProgress', ({ stage }) => {
        if (stage === 'done' || stage === 'failed') reload();
      }),
      backend.on('meetingChanged', reload),
      backend.on('recordingStateChanged', (recording) => {
        if (recording.status !== status) reload();
        status = recording.status;
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, reload]);

  const pickFile = async () => {
    setPickError(null);
    try {
      setPicked(await backend.call('pickAudioFile'));
    } catch (failure) {
      setPickError(failure instanceof Error ? failure.message : 'The file could not be opened.');
    }
  };

  const filtered = Boolean(query || origin || from || to);
  const clearFilters = () => {
    setTyped('');
    setQuery('');
    setOrigin('');
    setFrom('');
    setTo('');
  };

  return (
    <SplitLayout
      title="Recordings"
      header={
        <>
          <input
            ref={searchBox}
            type="search"
            className={styles.search}
            aria-label="Search recordings"
            placeholder="Search titles, dates and transcripts"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button type="button" className={styles.primary} onClick={() => void pickFile()}>
            Import audio file
          </button>
          <div className={styles.filters}>
            <label className={`${styles.field} ${styles.filterSource}`}>
              Source
              <select
                className={styles.input}
                value={origin}
                onChange={(event) => setOrigin(event.target.value as Origin)}
              >
                <option value="">All</option>
                <option value="recorded">Recorded</option>
                <option value="imported">Imported</option>
              </select>
            </label>
            <label className={styles.field}>
              From
              <input
                type="date"
                className={styles.input}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              To
              <input
                type="date"
                className={styles.input}
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            {filtered && (
              <button
                type="button"
                className={`${styles.button} ${styles.filterSource}`}
                onClick={clearFilters}
              >
                Clear
              </button>
            )}
          </div>
          {notice && <p role="status">{notice}</p>}
          {pickError && <p role="alert">{pickError}</p>}
          <ImportPanel onOpen={onOpen} />
        </>
      }
      list={
        <DataView state={state}>
          {(results) =>
            results.length > 0 ? (
              <ul className={`${styles.rows} ${list.list}`}>
                {results.map((result) => (
                  <MeetingRow
                    key={result.meeting.id}
                    result={result}
                    query={query}
                    selected={result.meeting.id === selectedId}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            ) : filtered ? (
              <EmptyState compact title="No matching recordings">
                Try different words, or clear the filters.
              </EmptyState>
            ) : (
              <EmptyState compact title="No recordings yet">
                Meetings you record or import will appear here.
              </EmptyState>
            )
          }
        </DataView>
      }
    >
      {children}
      {picked && <ImportDialog file={picked} onClose={() => setPicked(null)} />}
    </SplitLayout>
  );
}
