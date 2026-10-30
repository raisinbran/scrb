import {
  CALL_NAMES,
  ContractError,
  isValidRequest,
  type CallEnvelope,
  type CallName,
  type ContractErrorCode,
} from '@scrb/contracts';

/** Backend calls by name. Empty until the app core is merged; missing calls report notImplemented. */
export type CallHandlers = Partial<Record<CallName, (request: unknown) => Promise<unknown>>>;

const allowedCalls = new Set<string>(CALL_NAMES);

function fail(code: ContractErrorCode, message: string): CallEnvelope {
  return { ok: false, error: { code, message } };
}

/** Checks one call from the renderer and runs it. Never throws: failures become envelopes. */
export async function dispatchCall(
  handlers: CallHandlers,
  name: unknown,
  request: unknown,
): Promise<CallEnvelope> {
  if (typeof name !== 'string' || !allowedCalls.has(name)) {
    return fail('invalidRequest', 'Unknown request.');
  }
  const callName = name as CallName;
  if (!isValidRequest(callName, request))
    return fail('invalidRequest', 'That request is not valid.');
  const handler = handlers[callName];
  if (!handler) return fail('notImplemented', 'This feature is not available yet.');
  try {
    return { ok: true, value: await handler(request) };
  } catch (error) {
    // A ContractError was written for the user. Anything else stays out of the renderer; the
    // backend logs it under the logging rules.
    if (error instanceof ContractError) return fail(error.code, error.message);
    return fail('internal', 'Something went wrong.');
  }
}
