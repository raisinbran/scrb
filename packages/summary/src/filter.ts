import { contentTokens } from "./text.js";

const NON_ITEM_PATTERNS: [RegExp, string][] = [
  [/\b(introduc\w+|welcom\w+)\b.*\b(themselves|yourself|yourselves|team|everyone|each other)\b/i, "introductions"],
  [/\b(is|as|be) (the|our) (new )?[\w ]{0,25}(manager|designer|expert|lead|facilitator|secretary|chair)\b\.?$/i, "role statement"],
  [/\b(agenda|presentation order|order of (the )?presentations?|speaking order)\b/i, "agenda"],
  [/\b(present(s|ing)?|go(es)?|speak(s|ing)?) (first|next|second|last)\b/i, "running order"],
  [/\b(close|end|conclude|adjourn|wrap up|finish)(s|ing)? (the |this )?(meeting|session|call)\b/i, "closing the meeting"],
  [/\b(meeting|session|call) (will|is to|would|should) (be )?(clos|conclud|end|adjourn|finish)/i, "closing the meeting"],
  [/\b(review|read|check|look at|look over) (the |last |previous )*(meeting )?minutes\b/i, "reviewing minutes"],
  [/\bmake (a|the|their|our) decisions? (on|about|regarding)\b/i, "a decision to decide"],
  [/\b(will|to|should|must) (discuss|talk about|go over|cover)\b(?!.*\b(with|before|after|next|later|by)\b)/i, "discussion, not a result"],
  [/\b(take|have|taking) a (short |quick )?(break|lunch)\b/i, "logistics"],
];

const MIN_CONTENT_TOKENS = 2;

/** Why this is not a real item, or null if it passes. Procedure, not substance, is what gets cut. */
export function nonItemReason(text: string): string | null {
  if (contentTokens(text).size < MIN_CONTENT_TOKENS) return "too short to be an item";
  for (const [pattern, reason] of NON_ITEM_PATTERNS) if (pattern.test(text)) return reason;
  return null;
}
