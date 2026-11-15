import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import { RunError } from './errors.js';

/** True if the machine can reach a public host (a DNS lookup or a TCP connection succeeds). */
export async function canReachPublicHost(): Promise<boolean> {
  const dns = lookup('example.com').then(
    () => true,
    () => false,
  );
  const tcp = new Promise<boolean>((resolve) => {
    const s = connect({ host: '1.1.1.1', port: 443, timeout: 3000 });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('timeout', () => (s.destroy(), resolve(false)));
    s.once('error', () => resolve(false));
  });
  const [a, b] = await Promise.all([dns, tcp]);
  return a || b;
}

/** Plan section 8: refuse to start if a public host is reachable. The probe is injectable for tests. */
export async function assertOffline(
  probe: () => Promise<boolean> = canReachPublicHost,
): Promise<void> {
  if (await probe()) throw new RunError('E_NETWORK_REACHABLE');
}
