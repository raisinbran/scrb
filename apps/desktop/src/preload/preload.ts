import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  CALL_NAMES,
  EVENT_NAMES,
  IPC_CALL_CHANNEL,
  IPC_EVENT_CHANNEL,
  type CallEnvelope,
  type CallName,
  type EventName,
  type ScribeBridge,
} from '@scrb/contracts';

const allowedCalls = new Set<string>(CALL_NAMES);
const allowedEvents = new Set<string>(EVENT_NAMES);

const bridge: ScribeBridge = {
  platform: process.platform,
  invoke(name: CallName, request: unknown): Promise<CallEnvelope> {
    if (!allowedCalls.has(name)) throw new Error(`Unknown call: ${name}`);
    return ipcRenderer.invoke(IPC_CALL_CHANNEL, name, request);
  },
  subscribe(name: EventName, listener: (payload: unknown) => void) {
    if (!allowedEvents.has(name)) throw new Error(`Unknown event: ${name}`);
    // The Electron event object is withheld: it exposes `sender`, which reaches ipcRenderer.
    const forward = (_event: IpcRendererEvent, eventName: string, payload: unknown) => {
      if (eventName === name) listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNEL, forward);
    return () => ipcRenderer.off(IPC_EVENT_CHANNEL, forward);
  },
};

contextBridge.exposeInMainWorld('scribeBridge', bridge);
