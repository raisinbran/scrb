// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ContractError, type ContractErrorCode } from '@scrb/contracts';
import { dispatchCall } from './dispatch.ts';

describe('dispatchCall', () => {
  it('returns the handler value', async () => {
    const envelope = await dispatchCall({ listTerms: async () => [] }, 'listTerms', undefined);
    expect(envelope).toEqual({ ok: true, value: [] });
  });

  it.each<ContractErrorCode>(['notFound', 'conflict', 'permissionDenied', 'diskFull'])(
    'keeps the %s code and message',
    async (code) => {
      const handler = async () => {
        throw new ContractError({ code, message: 'Shown to the user.' });
      };
      const envelope = await dispatchCall({ listTerms: handler }, 'listTerms', undefined);
      expect(envelope).toEqual({ ok: false, error: { code, message: 'Shown to the user.' } });
    },
  );

  it('hides the details of an unexpected error', async () => {
    const handler = async () => {
      throw new Error('/Users/someone/meeting.db is locked');
    };
    const envelope = await dispatchCall({ listTerms: handler }, 'listTerms', undefined);
    expect(envelope).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Something went wrong.' },
    });
  });

  it('refuses an unknown call', async () => {
    const envelope = await dispatchCall({}, 'runShell', undefined);
    expect(envelope).toMatchObject({ ok: false, error: { code: 'invalidRequest' } });
  });

  it('refuses a malformed request before reaching the handler', async () => {
    let ran = false;
    const handler = async () => {
      ran = true;
    };
    const envelope = await dispatchCall({ getMeeting: handler }, 'getMeeting', { meetingId: 7 });
    expect(envelope).toMatchObject({ ok: false, error: { code: 'invalidRequest' } });
    expect(ran).toBe(false);
  });

  it('reports a valid call with no handler as not implemented', async () => {
    const envelope = await dispatchCall({}, 'getMeeting', { meetingId: 'm-1' });
    expect(envelope).toMatchObject({ ok: false, error: { code: 'notImplemented' } });
  });
});
