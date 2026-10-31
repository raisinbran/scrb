import type { MeetingFilter, MeetingListItem } from './types.ts';

function localDay(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const date = new Date(iso);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Dates filter by the owner's local calendar day, not by UTC midnight. */
export function matchesMeetingFilter(
  meeting: Pick<MeetingListItem, 'origin' | 'startedAt'>,
  { origin, from, to }: MeetingFilter = {},
): boolean {
  const day = localDay(meeting.startedAt);
  return (
    (!origin || meeting.origin === origin) &&
    (!from || day >= localDay(from)) &&
    (!to || day <= localDay(to))
  );
}
