import 'server-only';

import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcrypt at cost 12: roughly 250ms per hash on typical serverless hardware,
 * which is slow enough to make offline cracking expensive and fast enough not
 * to hold a request open. bcryptjs (pure JS) rather than a native binding
 * because serverless build images vary and a native module that fails to
 * compile at deploy time is a worse outcome than a slightly slower hash.
 *
 * bcrypt silently truncates input beyond 72 bytes, which is why the password
 * schema caps length there rather than accepting longer input that would give
 * a false sense of strength.
 */

const COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A precomputed hash of a value nobody can guess.
 *
 * When login is attempted for an address with no account, we still run a
 * comparison against this. Without it, a missing account returns noticeably
 * faster than a wrong password, and that timing difference is enough to
 * enumerate which email addresses are registered.
 */
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-timing-equaliser', COST);

export async function equalizeTiming(): Promise<void> {
  await bcrypt.compare('not-a-real-password-timing-equaliser', DUMMY_HASH);
}
