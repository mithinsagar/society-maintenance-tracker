/**
 * Domain constants shared by the server, the API contract and the UI.
 *
 * Everything the product knows about categories, statuses and priorities is
 * declared once, here. Screens derive their labels, colours and orderings from
 * these tables rather than restating them, so adding a category is a one-line
 * change instead of a hunt through the codebase.
 */
import type { ComplaintCategory, ComplaintStatus, Priority, Role } from '@/server/db/schema';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const COMPLAINT_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

export const STATUS_DESCRIPTIONS: Record<ComplaintStatus, string> = {
  OPEN: 'Logged and awaiting assignment',
  IN_PROGRESS: 'Being worked on by the maintenance team',
  RESOLVED: 'Work completed and complaint closed',
};

/**
 * The complaint lifecycle, as an explicit transition table.
 *
 * `RESOLVED` maps to an empty list: once a complaint is resolved it is closed,
 * and there is no edge back out. Encoding the lifecycle as data rather than a
 * chain of `if` statements means the rule is testable in isolation and the UI
 * can render exactly the transitions the server will accept — the two can
 * never drift.
 */
export const STATUS_TRANSITIONS: Record<ComplaintStatus, readonly ComplaintStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: [],
};

export function canTransition(from: ComplaintStatus, to: ComplaintStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/** Display order for the lifecycle spine on the complaint detail page. */
export const LIFECYCLE_ORDER: readonly ComplaintStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

/** Sort weight — higher is more urgent. Used for the admin queue ordering. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const COMPLAINT_CATEGORIES = [
  'PLUMBING',
  'ELECTRICAL',
  'CLEANING',
  'SECURITY',
  'ELEVATOR',
  'WATER_SUPPLY',
  'COMMON_AREA',
  'PARKING',
  'NOISE',
  'PEST_CONTROL',
  'OTHER',
] as const;

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  PLUMBING: 'Plumbing',
  ELECTRICAL: 'Electrical',
  CLEANING: 'Cleaning',
  SECURITY: 'Security',
  ELEVATOR: 'Lift / Elevator',
  WATER_SUPPLY: 'Water Supply',
  COMMON_AREA: 'Common Area',
  PARKING: 'Parking',
  NOISE: 'Noise',
  PEST_CONTROL: 'Pest Control',
  OTHER: 'Other',
};

/** Short hints shown under each option in the complaint form. */
export const CATEGORY_HINTS: Record<ComplaintCategory, string> = {
  PLUMBING: 'Leaks, blocked drains, taps, sanitary fittings',
  ELECTRICAL: 'Power failure, wiring, fixtures, meter issues',
  CLEANING: 'Housekeeping, garbage collection, corridor cleaning',
  SECURITY: 'Gate access, intercom, CCTV, visitor management',
  ELEVATOR: 'Lift breakdown, noise, door faults, AMC issues',
  WATER_SUPPLY: 'Tanker delays, low pressure, pump, water quality',
  COMMON_AREA: 'Clubhouse, garden, terrace, staircase, lobby',
  PARKING: 'Slot disputes, unauthorised parking, ramp damage',
  NOISE: 'Construction, loud gatherings, generator noise',
  PEST_CONTROL: 'Mosquitoes, rodents, termites, stray animals',
  OTHER: 'Anything that does not fit the categories above',
};

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const ROLE_LABELS: Record<Role, string> = {
  RESIDENT: 'Resident',
  ADMIN: 'Admin',
};

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const ACCEPTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const;

/** Longest edge, in pixels, that the browser downscales to before uploading. */
export const CLIENT_IMAGE_MAX_EDGE = 1600;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = 'smt_session';
export const SESSION_DURATION_DAYS = 7;
/**
 * A session within this window of expiry is silently extended on use, so an
 * active user is never logged out mid-task while an abandoned session still
 * expires on schedule.
 */
export const SESSION_REFRESH_THRESHOLD_DAYS = 5;
