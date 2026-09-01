import { describe, expect, it } from 'vitest';

import {
  changePasswordSchema,
  complaintQuerySchema,
  createComplaintSchema,
  emailSchema,
  flatNumberSchema,
  loginSchema,
  passwordSchema,
  phoneSchema,
  registerSchema,
  updatePrioritySchema,
  updateStatusSchema,
  uploadSignatureSchema,
} from '../src/lib/validation';

/**
 * Schema unit tests.
 *
 * These schemas are the API contract — every route parses input through them
 * before it reaches a service — but nothing exercised them directly. This
 * covers the rules a route-level integration test would only hit by accident:
 * the exact boundary of each `.min()`/`.max()`, and the transforms that run
 * silently (lowercasing, trimming, empty-string-to-undefined).
 */

describe('emailSchema', () => {
  it('lowercases and trims', () => {
    const result = emailSchema.safeParse('  User@Example.com  ');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe('user@example.com');
  });

  it('rejects a string with no @', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Abcdefg1').success).toBe(true);
  });

  it('rejects fewer than 8 characters', () => {
    expect(passwordSchema.safeParse('Abc123').success).toBe(false);
  });

  it('rejects more than 72 characters', () => {
    expect(passwordSchema.safeParse('Aa1' + 'a'.repeat(70)).success).toBe(false);
  });

  it('rejects a password with no uppercase letter', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(false);
  });

  it('rejects a password with no lowercase letter', () => {
    expect(passwordSchema.safeParse('ABCDEFG1').success).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(passwordSchema.safeParse('Abcdefgh').success).toBe(false);
  });
});

describe('flatNumberSchema', () => {
  it.each(['B-1204', 'A/12', '204', 'Tower 4 - 12'])('accepts %s', (value) => {
    expect(flatNumberSchema.safeParse(value).success).toBe(true);
  });

  it('rejects punctuation outside the allowed set', () => {
    expect(flatNumberSchema.safeParse('B#1204').success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(flatNumberSchema.safeParse('').success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('treats an empty string as absent rather than invalid', () => {
    const result = phoneSchema.safeParse('');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeUndefined();
  });

  it('accepts a plausible international number', () => {
    expect(phoneSchema.safeParse('+91 98765 43210').success).toBe(true);
  });

  it('rejects letters', () => {
    expect(phoneSchema.safeParse('call-me-maybe').success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    fullName: 'Asha Rao',
    email: 'asha@example.com',
    password: 'Abcdefg1',
    flatNumber: 'B-1204',
  };

  it('accepts a minimal valid submission', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('does not let the caller assign their own role', () => {
    const result = registerSchema.safeParse({ ...valid, role: 'ADMIN' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty('role');
  });

  it('rejects a one-character name', () => {
    expect(registerSchema.safeParse({ ...valid, fullName: 'A' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('is lenient about email shape, unlike registration', () => {
    // Login must not reveal *why* a credential failed, so it only checks presence.
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('rejects reusing the current password as the new one', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'Abcdefg1',
      newPassword: 'Abcdefg1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(['newPassword']);
    }
  });

  it('accepts a genuinely different new password', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'Abcdefg1', newPassword: 'Zzzzzzz9' })
        .success,
    ).toBe(true);
  });
});

describe('createComplaintSchema', () => {
  const valid = {
    title: 'Leaking pipe in basement',
    description: 'Water has been pooling near the parking area for two days.',
    category: 'PLUMBING',
  };

  it('accepts a well-formed complaint', () => {
    expect(createComplaintSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a description under the 20-character floor', () => {
    expect(createComplaintSchema.safeParse({ ...valid, description: 'too short' }).success).toBe(
      false,
    );
  });

  it('rejects a category outside the enum', () => {
    expect(createComplaintSchema.safeParse({ ...valid, category: 'ALIEN_INVASION' }).success).toBe(
      false,
    );
  });
});

describe('updateStatusSchema and updatePrioritySchema', () => {
  it('accepts an empty note as a valid, non-required value', () => {
    // Unlike phoneSchema, there is no regex forcing the left branch of the
    // `.optional().or(literal(''))` union to fail on an empty string — `''`
    // satisfies `.max(1000)` on its own, so it comes through as `''`, not
    // `undefined`. Documented here so a future edit to this schema doesn't
    // change that silently.
    const result = updateStatusSchema.safeParse({ status: 'RESOLVED', note: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBe('');
  });

  it('rejects a status outside the enum', () => {
    expect(updateStatusSchema.safeParse({ status: 'CANCELLED' }).success).toBe(false);
  });

  it('rejects a priority outside the enum', () => {
    expect(updatePrioritySchema.safeParse({ priority: 'CRITICAL' }).success).toBe(false);
  });
});

describe('complaintQuerySchema', () => {
  it('defaults page and pageSize when omitted', () => {
    const result = complaintQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.sort).toBe('createdAt');
      expect(result.data.order).toBe('desc');
    }
  });

  it('drops unrecognised values from a multi-value filter instead of failing', () => {
    const result = complaintQuerySchema.safeParse({ status: 'OPEN,NOT_A_STATUS' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.status).toEqual(['OPEN']);
  });

  it('turns the overdue string flag into a real boolean', () => {
    const result = complaintQuerySchema.safeParse({ overdue: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.overdue).toBe(true);
  });

  it('rejects a page size above the configured maximum', () => {
    expect(complaintQuerySchema.safeParse({ pageSize: 10_000 }).success).toBe(false);
  });
});

describe('uploadSignatureSchema', () => {
  it('accepts an image within the size ceiling', () => {
    expect(
      uploadSignatureSchema.safeParse({ contentType: 'image/jpeg', byteSize: 1_000_000 }).success,
    ).toBe(true);
  });

  it('rejects a file over 5 MB', () => {
    expect(
      uploadSignatureSchema.safeParse({ contentType: 'image/jpeg', byteSize: 6_000_000 }).success,
    ).toBe(false);
  });

  it('rejects a content type outside the accepted image formats', () => {
    expect(
      uploadSignatureSchema.safeParse({ contentType: 'application/pdf', byteSize: 1000 }).success,
    ).toBe(false);
  });
});
