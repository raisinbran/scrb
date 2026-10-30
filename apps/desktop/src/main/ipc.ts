import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CALL_CHANNEL, type CallEnvelope } from '@scrb/contracts';
import { dispatchCall, type CallHandlers } from './dispatch.ts';

export type { CallHandlers } from './dispatch.ts';

export function registerCallHandlers(
  handlers: CallHandlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  ipcMain.handle(
    IPC_CALL_CHANNEL,
    async (event, name: unknown, request: unknown): Promise<CallEnvelope> => {
      if (!isTrustedSender(event)) {
        return { ok: false, error: { code: 'invalidRequest', message: 'Request refused.' } };
      }
      return dispatchCall(handlers, name, request);
    },
  );
}
