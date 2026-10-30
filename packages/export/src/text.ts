// Characters XML 1.0 cannot carry, plus Unicode non-characters. A single one
// makes Word refuse the whole file, so they are removed before any rendering.
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F\uFDD0-\uFDEF\uFFFE\uFFFF]/g;
const LINE_BREAKS = /\s*[\r\n\u0085\u2028\u2029]+\s*/g;
const SPACE_RUNS = /[ \t]+/g;

const FIRST_LETTER = /\p{L}/u;
const RTL_LETTER = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u;

/** Makes text safe for both formats and identical in both: one line, single spaces. */
export function cleanInline(text: string): string {
  return text
    .toWellFormed()
    .replace(UNSAFE_CHARS, '')
    .replace(LINE_BREAKS, ' ')
    .replace(SPACE_RUNS, ' ');
}

/** True when the first letter is from a right-to-left script. */
export function isRtl(text: string): boolean {
  const first = FIRST_LETTER.exec(text);
  return first !== null && RTL_LETTER.test(first[0]);
}

export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  return `${Math.floor(total / 3600)}:${pad(minutes)}:${pad(seconds)}`;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total} sec`;
  const totalMinutes = Math.round(total / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
