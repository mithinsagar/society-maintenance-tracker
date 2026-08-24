import 'server-only';

import { eq } from 'drizzle-orm';

import type { LoginInput, RegisterInput } from '@/lib/validation';
import { db } from '@/server/db';
import { isUniqueViolation } from '@/server/db/errors';
import { users, type Role } from '@/server/db/schema';
import { ConflictError, UnauthorizedError, ValidationError } from '@/server/errors';

import { equalizeTiming, hashPassword, verifyPassword } from '../auth/password';
import type { SessionUser } from '../auth/session';

/**
 * Authentication service.
 *
 * Note what registration does *not* accept: a role. Roles are assigned by seed
 * or promoted directly in the database. A self-service "register as admin"
 * path — even one hidden in the UI — is a privilege-escalation hole, because
 * the field would still be present on the endpoint.
 */

function toSessionUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    flatNumber: row.flatNumber,
    phone: row.phone,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export async function register(input: RegisterInput): Promise<SessionUser> {
  const passwordHash = await hashPassword(input.password);

  try {
    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        flatNumber: input.flatNumber,
        phone: input.phone ?? null,
        // Explicit, not defaulted from input — the request cannot influence it.
        role: 'RESIDENT',
      })
      .returning();

    if (!created) throw new Error('Failed to create account.');
    return toSessionUser(created);
  } catch (error) {
    // Rely on the unique constraint rather than a check-then-insert, which
    // would race: two simultaneous registrations could both pass the check
    // and one would then fail with a 500.
    if (isUniqueViolation(error)) {
      throw new ConflictError('An account with this email already exists.', [
        { path: 'email', message: 'This email is already registered.' },
      ]);
    }
    throw error;
  }
}

/**
 * Verifies credentials.
 *
 * Every failure returns the same message. Distinguishing "no such account"
 * from "wrong password" would let anyone test which addresses are registered.
 * The dummy comparison on the missing-user path keeps the response time
 * similar, closing the timing side-channel that would otherwise leak the same
 * information.
 */
export async function authenticate(input: LoginInput): Promise<SessionUser> {
  const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!user) {
    await equalizeTiming();
    throw new UnauthorizedError('Incorrect email or password.');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new UnauthorizedError('Incorrect email or password.');
  }

  if (!user.isActive) {
    throw new UnauthorizedError('This account has been deactivated. Contact the society office.');
  }

  return toSessionUser(user);
}

export async function updateProfile(
  userId: string,
  input: { fullName: string; flatNumber: string; phone?: string },
): Promise<SessionUser> {
  const [updated] = await db
    .update(users)
    .set({ fullName: input.fullName, flatNumber: input.flatNumber, phone: input.phone ?? null })
    .where(eq(users.id, userId))
    .returning();

  if (!updated) throw new Error('Failed to update profile.');
  return toSessionUser(updated);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new UnauthorizedError();

  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) {
    throw new ValidationError('Your current password is incorrect.', [
      { path: 'currentPassword', message: 'Incorrect password.' },
    ]);
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.newPassword) })
    .where(eq(users.id, userId));
}

/** Recipients for an important-notice fan-out. */
export async function listActiveResidents(): Promise<
  Array<{ id: string; email: string; fullName: string }>
> {
  return db
    .select({ id: users.id, email: users.email, fullName: users.fullName })
    .from(users)
    .where(eq(users.isActive, true));
}

export type { Role };
