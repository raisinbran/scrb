import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { CALL_NAMES, IPC_CALL_CHANNEL, type CallEnvelope, type CallName } from '@scrb/contracts';

/** Backend calls by name. Empty until the app core is merged; missing calls report notImplemented. */
export type CallHandlers = Partial<Record<CallName, (request: unknown) => Promise<unknown>>>;

const allowedCalls = new Set<string>(CALL_NAMES);

function fail(
  code: 'invalidRequest' | 'notImplemented' | 'internal',
  message: string,
): CallEnvelope {
  return { ok: false, error: { code, message } };
}

export function registerCallHandlers(
  handlers: CallHandlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  ipcMain.handle(
    IPC_CALL_CHANNEL,
    async (event, name: unknown, request: unknown): Promise<CallEnvelope> => {
      if (!isTrustedSender(event)) return fail('invalidRequest', 'Request refused.');
      if (typeof name !== 'string' || !allowedCalls.has(name)) {
        return fail('invalidRequest', 'Unknown request.');
      }
      const handler = handlers[name as CallName];
      if (!handler) return fail('notImplemented', 'This feature is not available yet.');
      try {
        return { ok: true, value: await handler(request) };
      } catch {
        // Internal details stay out of the renderer; the backend logs them under the logging rules.
        return fail('internal', 'Something went wrong.');
      }
    },
  );
}
