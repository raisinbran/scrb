// Fails `npm run typecheck` when the types generated from scrb-protocol disagree with the
// hand-written types the screens use.
import type { BackendCalls, BackendEvents, CallName, ContractErrorCode } from './backend.ts';
import type { ErrorCode } from './generated/ErrorCode.ts';
import type {
  CoreAskName,
  CoreEvents,
  CoreScreenCalls,
  MainOnlyCallName,
} from './generated/calls.ts';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// Each call the core answers has the screens' request and reply types.
export type CallsMatch = Assert<
  Same<CoreScreenCalls, Pick<BackendCalls, keyof CoreScreenCalls & CallName>>
>;
// Each event the core sends has the screens' payload type.
export type EventsMatch = Assert<Same<CoreEvents, Pick<BackendEvents, keyof CoreEvents>>>;
// No main-only call or core request (an `ask`) can be sent from a screen.
export type NoLeaks = Assert<Same<Extract<MainOnlyCallName | CoreAskName, CallName>, never>>;
// The core sends only the error codes the screens know.
export type ErrorCodesMatch = Assert<Same<ErrorCode, ContractErrorCode>>;
