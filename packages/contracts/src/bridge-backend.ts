import {
  type Backend,
  type BackendEvents,
  type CallName,
  ContractError,
  type EventName,
  type ScribeBridge,
  type Unsubscribe,
} from './backend.ts';

/** Adapts the preload bridge to `Backend`, turning failed envelopes back into `ContractError`. */
export function createBridgeBackend(bridge: ScribeBridge): Backend {
  return {
    async call(name: CallName, request?: unknown) {
      const envelope = await bridge.invoke(name, request);
      if (!envelope.ok) throw new ContractError(envelope.error);
      return envelope.value;
    },
    on<K extends EventName>(name: K, listener: (payload: BackendEvents[K]) => void): Unsubscribe {
      return bridge.subscribe(name, (payload) => listener(payload as BackendEvents[K]));
    },
  } as Backend;
}
