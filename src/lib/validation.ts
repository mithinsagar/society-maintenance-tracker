/**
 * Validation schemas.
 *
 * These are the API contract. Every route handler parses its input through the
 * schema here before the request reaches a service, and the forms reuse the
 * same schemas so client-side messages match server-side rules exactly.
 *
 * Client-side validation is a convenience; these schemas running on the server
 * are the enforcement.
 */
import { z } from 'zod';

import {
  ACCEPTED_IMAGE_TYPES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_STATUSES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_UPLOAD_BYTES,
  PRIORITIES,
} from './constants';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const uuidSchema = z.string().uuid('Not a valid identifier.');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(255, 'Email is too long.')
  .email('Enter a valid email address.')
  // Stored lowercase so uniqueness is case-insensitive; the database enforces
  // the same rule with a CHECK constraint.
  .transform((value) => value.toLowerCase());

/**
 * Password policy.
 *
 * Length is the dominant factor in resistance to offline cracking, so the
 * minimum is 8 with a required mix rather than an elaborate rule set that
 * pushes people toward `Passw0rd!`. The upper bound exists because bcrypt
 * silently truncates beyond 72 bytes — accepting longer input would give a
 * false sense of strength.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be 72 characters or fewer.')
  .regex(/[a-z]/, 'Password must include a lowercase letter.')
  .regex(/[A-Z]/, 'Password must include an uppercase letter.')
  .regex(/[0-9]/, 'Password must include a number.');

export const flatNumberSchema = z
  .string()
  .trim()
  .min(1, 'Flat number is required.')
  .max(20, 'Flat number is too long.')
  .regex(/^[A-Za-z0-9\-/ ]+$/, 'Use letters, numbers, hyphen or slash only, e.g. B-1204.');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s-]{7,20}$/, 'Enter a valid phone number.')
  .optional()
  .or(z.literal('').transform(() => undefined));

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name.')
    .max(120, 'Name is too long.'),
  email: emailSchema,
  password: passwordSchema,
  flatNumber: flatNumberSchema,
  phone: phoneSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  // Deliberately lenient: login must not leak *why* a credential failed, so
  // there is no format feedback here beyond "required".
  email: z.string().trim().min(1, 'Email is required.').toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120, 'Name is too long.'),
  flatNumber: flatNumberSchema,
  phone: phoneSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Choose a password different from your current one.',
    path: ['newPassword'],
  });

// ---------------------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------------------

export const photoSchema = z
  .object({
    publicId: z.string().trim().min(1).max(300),
    url: z.string().url(),
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
  })
  .optional()
  .nullable();

export const createComplaintSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Give the issue a short title (at least 5 characters).')
    .max(120, 'Title must be 120 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(20, 'Describe the issue in at least 20 characters so it can be actioned.')
    .max(4000, 'Description must be 4000 characters or fewer.'),
  category: z.enum(COMPLAINT_CATEGORIES),
  photo: photoSchema,
});

export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateStatusSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES),
  note: z
    .string()
    .trim()
    .max(1000, 'Note must be 1000 characters or fewer.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export const updatePrioritySchema = z.object({
  priority: z.enum(PRIORITIES),
  note: z
    .string()
    .trim()
    .max(1000, 'Note must be 1000 characters or fewer.')
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

// ---------------------------------------------------------------------------
// Query parameters
// ---------------------------------------------------------------------------

/** Accepts a repeated or comma-separated query param and yields a typed array. */
function multiEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const list = Array.isArray(value) ? value : value.split(',');
      const filtered = list
        .map((item) => item.trim())
        .filter((item): item is T[number] => (values as readonly string[]).includes(item));
      return filtered.length > 0 ? filtered : undefined;
    });
}

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const COMPLAINT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'priority',
  'status',
  'reference',
] as const;

export const complaintQuerySchema = paginationSchema.extend({
  /** Free-text search across reference, title and description. */
  q: z.string().trim().max(200).optional(),
  status: multiEnum(COMPLAINT_STATUSES),
  category: multiEnum(COMPLAINT_CATEGORIES),
  priority: multiEnum(PRIORITIES),
  /** `true` restricts to overdue, `false` excludes them, omitted means all. */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(COMPLAINT_SORT_FIELDS).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ComplaintQuery = z.infer<typeof complaintQuerySchema>;

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const createNoticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, 'Give the notice a title (at least 5 characters).')
    .max(160, 'Title must be 160 characters or fewer.'),
  body: z
    .string()
    .trim()
    .min(10, 'Notice content must be at least 10 characters.')
    .max(8000, 'Notice content must be 8000 characters or fewer.'),
  isImportant: z.boolean().default(false),
});

export const updateNoticeSchema = createNoticeSchema.partial();

export const noticeQuerySchema = paginationSchema.extend({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const updateSettingsSchema = z.object({
  societyName: z.string().trim().min(2).max(120).optional(),
  overdueThresholdDays: z.coerce
    .number()
    .int()
    .min(1, 'Threshold must be at least 1 day.')
    .max(365, 'Threshold must be 365 days or fewer.')
    .optional(),
});

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const uploadSignatureSchema = z.object({
  /**
   * Declared up front so the server can reject an oversized or wrong-typed
   * file *before* issuing a signature, rather than discovering it afterwards.
   * The server re-verifies the stored asset independently — this is a fast
   * rejection, not the security boundary.
   */
  contentType: z.enum(ACCEPTED_IMAGE_TYPES),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, 'Image must be 5 MB or smaller.'),
});

export const confirmUploadSchema = z.object({
  publicId: z.string().trim().min(1).max(300),
});
