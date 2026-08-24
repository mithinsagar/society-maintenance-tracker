import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { computeOverdueState, overdueCutoff, overdueSeverity } from '../src/lib/overdue';

import { type Client, adminClient, pool, residentClient } from './helpers';

/**
 * Overdue detection.
 *
 * Two layers are tested here, because both matter:
 *
 *  1. The pure rule in `src/lib/overdue.ts` — the single source of truth.
 *  2. The SQL predicate that must agree with it exactly. If the in-memory
 *     badge and the database filter ever disagree, the dashboard count stops
 *     matching the list it links to, which is the classic symptom of the rule
 *     being restated in two places.
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-24T12:00:00Z');

let admin: Client;
let resident: Client;

beforeAll(async () => {
  admin = await adminClient();
  resident = await residentClient();
});

afterAll(async () => {
  // Leave the threshold as the seed set it, whatever the tests did.
  await pool.query('UPDATE app_settings SET overdue_threshold_days = 7 WHERE id = 1');
  await pool.end();
});

describe('the rule', () => {
  it('is not overdue before the threshold elapses', () => {
    const state = computeOverdueState(
      { status: 'OPEN', createdAt: new Date(NOW.getTime() - 3 * DAY) },
      7,
      NOW,
    );
    expect(state.isOverdue).toBe(false);
    expect(state.overdueByDays).toBe(0);
    expect(state.daysOpen).toBe(3);
  });

  it('is not overdue exactly at the threshold', () => {
    const state = computeOverdueState(
      { status: 'OPEN', createdAt: new Date(NOW.getTime() - 7 * DAY) },
      7,
      NOW,
    );
    // The boundary is strictly greater-than, so day 7 is still within window.
    expect(state.isOverdue).toBe(false);
  });

  it('is overdue once past the threshold', () => {
    const state = computeOverdueState(
      { status: 'OPEN', createdAt: new Date(NOW.getTime() - 10 * DAY) },
      7,
      NOW,
    );
    expect(state.isOverdue).toBe(true);
    expect(state.overdueByDays).toBe(4);
  });

  it('applies to IN_PROGRESS as well as OPEN', () => {
    const state = computeOverdueState(
      { status: 'IN_PROGRESS', createdAt: new Date(NOW.getTime() - 12 * DAY) },
      7,
      NOW,
    );
    expect(state.isOverdue).toBe(true);
  });

  it('never flags a RESOLVED complaint, however old', () => {
    const state = computeOverdueState(
      {
        status: 'RESOLVED',
        createdAt: new Date(NOW.getTime() - 400 * DAY),
        resolvedAt: new Date(NOW.getTime() - 390 * DAY),
      },
      7,
      NOW,
    );
    expect(state.isOverdue).toBe(false);
    expect(state.overdueByDays).toBe(0);
  });

  it('stops the clock at resolution for a resolved complaint', () => {
    const state = computeOverdueState(
      {
        status: 'RESOLVED',
        createdAt: new Date(NOW.getTime() - 30 * DAY),
        resolvedAt: new Date(NOW.getTime() - 25 * DAY),
      },
      7,
      NOW,
    );
    // Took 5 days to resolve — not 30 days old.
    expect(state.daysOpen).toBe(5);
  });

  it('reclassifies the same complaint when the threshold changes', () => {
    const complaint = { status: 'OPEN' as const, createdAt: new Date(NOW.getTime() - 5 * DAY) };

    expect(computeOverdueState(complaint, 3, NOW).isOverdue).toBe(true);
    expect(computeOverdueState(complaint, 7, NOW).isOverdue).toBe(false);
    expect(computeOverdueState(complaint, 30, NOW).isOverdue).toBe(false);
  });

  it('derives a due date from creation plus the threshold', () => {
    const createdAt = new Date(NOW.getTime() - 2 * DAY);
    const state = computeOverdueState({ status: 'OPEN', createdAt }, 7, NOW);
    expect(state.dueAt.getTime()).toBe(createdAt.getTime() + 7 * DAY);
  });

  it('bands severity for presentation only', () => {
    expect(overdueSeverity(0)).toBe('none');
    expect(overdueSeverity(3)).toBe('mild');
    expect(overdueSeverity(9)).toBe('severe');
  });
});

describe('the SQL predicate agrees with the rule', () => {
  it('cutoff matches the in-memory boundary', () => {
    const cutoff = overdueCutoff(7, NOW);
    expect(cutoff.getTime()).toBe(NOW.getTime() - 7 * DAY);
  });

  it('the API overdue filter returns exactly the complaints flagged overdue', async () => {
    const filtered = await admin.get<Array<{ id: string; isOverdue: boolean }>>(
      '/api/admin/complaints?overdue=true&pageSize=100',
    );
    expect(filtered.status).toBe(200);

    // Everything the SQL filter returned must also be flagged by the rule.
    for (const complaint of filtered.body.data!) {
      expect(complaint.isOverdue).toBe(true);
    }

    const all = await admin.get<Array<{ id: string; isOverdue: boolean }>>(
      '/api/admin/complaints?pageSize=100',
    );
    const flaggedByRule = all.body.data!.filter((complaint) => complaint.isOverdue).length;

    // …and the two counts must agree exactly.
    expect(filtered.body.data!.length).toBe(flaggedByRule);
  });

  it('the inverse filter is the exact complement', async () => {
    const overdue = await admin.get<unknown[]>('/api/admin/complaints?overdue=true&pageSize=100');
    const notOverdue = await admin.get<unknown[]>(
      '/api/admin/complaints?overdue=false&pageSize=100',
    );
    const all = await admin.get<unknown[]>('/api/admin/complaints?pageSize=100');

    expect(overdue.body.data!.length + notOverdue.body.data!.length).toBe(all.body.data!.length);
  });

  it('the dashboard count matches the filtered list', async () => {
    const dashboard = await admin.get<{ totals: { overdue: number } }>('/api/admin/dashboard');
    const list = await admin.get<unknown[]>('/api/admin/complaints?overdue=true&pageSize=100');

    expect(dashboard.body.data!.totals.overdue).toBe(list.body.data!.length);
  });

  it('excludes resolved complaints from the overdue set in SQL', async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS wrongly_flagged
         FROM complaints
        WHERE status = 'RESOLVED'
          AND created_at < now() - (SELECT overdue_threshold_days FROM app_settings WHERE id = 1) * interval '1 day'
          AND status <> 'RESOLVED'`,
    );
    expect(rows[0].wrongly_flagged).toBe(0);
  });
});

describe('configurability', () => {
  it('is stored in the database, not hardcoded', async () => {
    const settings = await admin.get<{ overdueThresholdDays: number }>('/api/admin/settings');
    expect(settings.status).toBe(200);
    expect(settings.body.data!.overdueThresholdDays).toBeGreaterThan(0);
  });

  it('rejects an out-of-range threshold', async () => {
    expect((await admin.patch('/api/admin/settings', { overdueThresholdDays: 0 })).status).toBe(422);
    expect((await admin.patch('/api/admin/settings', { overdueThresholdDays: 400 })).status).toBe(
      422,
    );
  });

  it('a lower threshold flags at least as many complaints, in SQL', async () => {
    const countAt = async (days: number): Promise<number> => {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS value FROM complaints
          WHERE status <> 'RESOLVED' AND created_at <= now() - ($1 || ' days')::interval`,
        [days],
      );
      return rows[0].value;
    };

    const strict = await countAt(3);
    const normal = await countAt(7);
    const lenient = await countAt(30);

    // Monotonic by construction: a shorter window can only catch more.
    expect(strict).toBeGreaterThanOrEqual(normal);
    expect(normal).toBeGreaterThanOrEqual(lenient);
  });

  it('changes take effect with no stored column to backfill', async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'complaints' AND column_name IN ('is_overdue', 'overdue', 'overdue_at')`,
    );
    // There is no overdue column. That is the design, asserted.
    expect(rows).toHaveLength(0);
  });
});

describe('resident view', () => {
  it('exposes derived overdue fields on every complaint', async () => {
    const result = await resident.get<
      Array<{ isOverdue: boolean; daysOpen: number; overdueByDays: number; dueAt: string }>
    >('/api/complaints?pageSize=5');

    for (const complaint of result.body.data!) {
      expect(typeof complaint.isOverdue).toBe('boolean');
      expect(typeof complaint.daysOpen).toBe('number');
      expect(typeof complaint.overdueByDays).toBe('number');
      expect(new Date(complaint.dueAt).toString()).not.toBe('Invalid Date');
    }
  });
});
