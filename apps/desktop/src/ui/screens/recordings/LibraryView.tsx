import { useCallback, useEffect, useRef, useState } from 'react';
import { matchesMeetingFilter } from '@scrb/contracts';
import type {
  Backend,
  MeetingFilter,
  MeetingListItem,
  PickedAudioFile,
  SearchResult,
} from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import { formatDuration, formatElapsed, formatMeetingDate } from '../../lib/format.ts';
import { useBackendData } from '../../lib/use-backend-data.ts';
import { DataView, EmptyState, Screen } from '../Screen.tsx';
import { ImportDialog, ImportPanel } from './ImportPanel.tsx';
import { STATUS_LABELS, SUMMARY_STATE_LABELS, isTransient } from './labels.ts';
import styles from './recordings.module.css';

const SEARCH_DELAY_MS = 200;
const POLL_MS = 3000;

type Origin = NonNullable<MeetingFilter['origin']> | '';

function Snippet({ text, query }: { text: string; query: string }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.mark}>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}

interface RowProps {
  result: SearchResult;
  query: string;
  onOpen(id: string, atMs?: number): void;
}

function MeetingRow({ result: { meeting, matches }, query, onOpen }: RowProps) {
  const status = STATUS_LABELS[meeting.status];
  const summary = SUMMARY_STATE_LABELS[meeting.summaryState];
  const snippets = matches.filter((match) => match.snippet !== null && match.startMs !== null);
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.rowMain}
        disabled={meeting.status === 'deleting'}
        onClick={() => onOpen(meeting.id)}
      >
        <span className={styles.rowTitle}>{meeting.title}</span>
        <span className={styles.muted}>
          {formatMeetingDate(meeting.startedAt)} · {formatDuration(meeting.durationMs)} ·{' '}
          {meeting.speakerCount === 1 ? '1 speaker' : `${meeting.speakerCount} speakers`}
        </span>
        <span className={styles.badges}>
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
      {snippets.map((match) => (
        <button
          key={`${match.segmentId ?? 'index'}-${match.startMs ?? 'none'}`}
          type="button"
          className={styles.snippet}
          onClick={() => onOpen(meeting.id, match.startMs as number)}
        >
          <span className={styles.time}>{formatElapsed(match.startMs as number)}</span>
          <span>
            <Snippet text={match.snippet as string} query={query} />
          </span>
        </button>
      ))}
    </li>
  );
}

interface LibraryViewProps {
  notice: string | null;
  onOpen(id: string, atMs?: number): void;
}

export function LibraryView({ notice, onOpen }: LibraryViewProps) {
  const backend = useBackend();
  const searchBox = useRef<HTMLInputElement>(null);
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const [origin, setOrigin] = useState<Origin>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
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

  useEffect(() => {
    let status: string | undefined;
    const stops = [
      backend.on('importFinished', reload),
      backend.on('summaryOutdated', reload),
      backend.on('summaryProgress', ({ stage }) => {
        if (stage === 'done' || stage === 'failed') reload();
      }),
      backend.on('recordingStateChanged', (recording) => {
        if (recording.status !== status) reload();
        status = recording.status;
      }),
    ];
    return () => stops.forEach((stop) => stop());
  }, [backend, reload]);

  const busy =
    state.status === 'ready' &&
    state.data.some(({ meeting }) => isTransient(meeting.status, meeting.summaryState));
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(reload, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, reload]);

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
    <Screen title="Recordings">
      <div className={styles.toolbar}>
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
      </div>
      <div className={styles.filters}>
        <label className={styles.field}>
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
          <button type="button" className={styles.button} onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {pickError && <p role="alert">{pickError}</p>}
      <ImportPanel onOpen={onOpen} />
      <DataView state={state}>
        {(results) =>
          results.length > 0 ? (
            <ul className={styles.rows}>
              {results.map((result) => (
                <MeetingRow key={result.meeting.id} result={result} query={query} onOpen={onOpen} />
              ))}
            </ul>
          ) : filtered ? (
            <EmptyState title="No matching recordings">
              Try different words, or clear the filters.
            </EmptyState>
          ) : (
            <EmptyState title="No recordings yet">
              Meetings you record or import will appear here.
            </EmptyState>
          )
        }
      </DataView>
      {picked && <ImportDialog file={picked} onClose={() => setPicked(null)} />}
    </Screen>
  );
}
