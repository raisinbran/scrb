import { RunError } from './errors.js';

/** What a model backend must do. The runner never sees anything else about the model. */
export interface Backend {
  /** Fixed identifier written to the manifest. Never a path. */
  id: string;
  complete(req: { system: string; user: string }): Promise<string>;
}

/** Frozen decoding settings (plan section 7). */
export const DECODING = { temperature: 0, seed: 20261115, maxTokens: 4096 } as const;

export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch {
    return false;
  }
}

/** OpenAI-compatible chat endpoint on this machine (llama.cpp server, Ollama, LM Studio). */
export function httpBackend(baseUrl: string, model: string): Backend {
  if (!isLocalUrl(baseUrl)) throw new RunError('E_BACKEND_NOT_LOCAL');
  return {
    id: model,
    async complete(req) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user', content: req.user },
            ],
            temperature: DECODING.temperature,
            seed: DECODING.seed,
            max_tokens: DECODING.maxTokens,
          }),
        });
      } catch {
        throw new RunError('E_BACKEND_UNREACHABLE');
      }
      if (!res.ok) throw new RunError('E_BACKEND_STATUS');
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw new RunError('E_BACKEND_SHAPE');
      return text;
    },
  };
}
