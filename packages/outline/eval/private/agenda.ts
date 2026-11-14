/**
 * Trims text taken from an agenda email or PDF to the agenda items. General rule, applied line by line:
 * the first sign-off line ("Thanks", "Regards", "Sent from", "--") ends the text; lines that are a
 * greeting, hold a link or an address, are meeting logistics (join, dial-in, passcode, "When:" ...),
 * hold a time or a date, have fewer than 2 words, or are long prose (over 20 words) are dropped.
 * When 3 or more lines carry a list marker or indentation (a structured agenda), an unmarked, unindented
 * line that ends in a period or colon is an intro or closing sentence and is dropped too.
 * Returns the kept lines and how many lines were considered.
 */
const SIGN_OFF =
  /^(?:thanks|thank you|many thanks|regards|best regards|kind regards|warm regards|best|cheers|sincerely|sent from|--+\s*$)/i;
const GREETING = /^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|greetings)\b/i;
const LINK = /https?:\/\/|\bwww\.|\S+@\S+\.\S+/i;
const LOGISTICS =
  /\b(?:join (?:the |our |us|zoom|microsoft|google|meeting|by)|dial[- ]?in|call[- ]in|passcode|meeting id|one tap|access code|click here|calendar invite|see you)\b|^(?:when|where|date|time|location|zoom|link|attendees|invitees)\s*:/i;
const TIME = /\b\d{1,2}:\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b/i;
const MONTH = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;
const WEEKDAY = /\b(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\b/i;
const NUMERIC_DATE = /\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/;

const MAX_WORDS = 20;

function isDateLine(line: string, words: number): boolean {
  if (TIME.test(line) || NUMERIC_DATE.test(line)) return true;
  return words <= 8 && /\d/.test(line) && (MONTH.test(line) || WEEKDAY.test(line));
}

export function trimAgenda(text: string): { text: string; seen: number; kept: number } {
  const kept: string[] = [];
  let seen = 0;
  const marked = (l: string): boolean =>
    /^\s+\S|^\s*(?:[-*•+]|\d+(?:\.\d+)*[.)]|\(?[A-Za-z][.)])\s/.test(l);
  const structured = text.split(/\r?\n/).filter(marked).length >= 3;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (SIGN_OFF.test(line)) {
      seen += 1;
      break;
    }
    seen += 1;
    const words = line
      .replace(/^(?:[-*•+]|\d+(?:\.\d+)*[.)]?|\(?[A-Za-z][.)])\s+/, '')
      .split(/\s+/)
      .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (words < 2 || words > MAX_WORDS) continue;
    if (structured && !marked(raw) && /[.:]$/.test(line)) continue;
    if (GREETING.test(line) || LINK.test(line) || LOGISTICS.test(line) || isDateLine(line, words))
      continue;
    kept.push(raw.trimEnd());
  }
  return { text: kept.join('\n'), seen, kept: kept.length };
}
