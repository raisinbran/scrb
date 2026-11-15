/** Every failure the runner reports is one of these fixed codes. No message text can reach stdout or logs. */
export class RunError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const codeOf = (e: unknown): string => (e instanceof RunError ? e.code : 'E_UNEXPECTED');

/** The only way the runner prints: a fixed code and numbers. */
export function logCode(code: string, ...numbers: number[]): void {
  process.stdout.write(`${code}${numbers.length ? ' ' + numbers.join(' ') : ''}\n`);
}
