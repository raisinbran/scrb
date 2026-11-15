import type { Backend } from './backend.js';

/**
 * A fake backend for tests and the privacy test: it echoes transcript lines back as notes, so any text it
 * sees is guaranteed to appear in its raw output. It runs no model. `fail` makes it throw an error whose
 * message contains transcript text, to prove error text never reaches stdout or logs.
 */
export function mockBackend(mode: 'echo' | 'fail' = 'echo'): Backend {
  return {
    id: mode === 'fail' ? 'mock-fail' : 'mock-echo',
    async complete({ user }) {
      const lines = [...user.matchAll(/^\[L(\d+)\] [^:]+: (.*)$/gm)].map((m) => ({
        n: Number(m[1]),
        text: m[2]!,
      }));
      if (mode === 'fail') throw new Error(`mock failure while reading: ${lines[0]?.text ?? ''}`);
      if (user.includes('Partial notes')) {
        const first = lines[0];
        return JSON.stringify({
          additions: first ? [{ topic: 'Notes', text: first.text, cite: `L${first.n}` }] : [],
          moves: [],
          edits: [],
        });
      }
      const outline = [...user.matchAll(/^\d+\. (.*)$/gm)].map((m) => m[1]!);
      const topics = outline.map((title, i) => {
        const l = lines[i % Math.max(1, lines.length)];
        return { title, points: l ? [{ text: l.text, cite: `L${l.n}` }] : [] };
      });
      return JSON.stringify({ topics });
    },
  };
}
