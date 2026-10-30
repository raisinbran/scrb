/** Timestamps as the model sees them: mm:ss, with minutes running past 99 if they must. */
export function formatStamp(seconds: number): string {
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function parseStamp(stamp: string): number | null {
  const match = /^(\d{1,3}):(\d{2})$/.exec(stamp.trim());
  if (!match || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
