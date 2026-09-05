import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildQueryString,
  formatDayCount,
  formatDuration,
  formatRelative,
  initials,
  nameColorIndex,
  truncate,
} from '../src/lib/utils';

/**
 * Pure display-helper unit tests.
 *
 * `src/lib/utils.ts` is imported by 19+ UI files but had no test file of its
 * own — unlike every other pure-logic module. These lock down the edge cases
 * (boundaries, empty/null input) that a visual regression would otherwise be
 * the only way to catch.
 */

describe('truncate', () => {
  it('returns the string unchanged at exactly the max length', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('truncates and trims trailing space before the ellipsis', () => {
    expect(truncate('abc def', 4)).toBe('abc…');
  });

  it('returns just the ellipsis when max is 0', () => {
    expect(truncate('abcdef', 0)).toBe('…');
  });
});

describe('formatDayCount', () => {
  it('reads "today" for zero days', () => {
    expect(formatDayCount(0)).toBe('today');
  });

  it('reads "today" for a negative day count', () => {
    expect(formatDayCount(-2)).toBe('today');
  });

  it('uses the singular for exactly one day', () => {
    expect(formatDayCount(1)).toBe('1 day');
  });

  it('uses the plural for more than one day', () => {
    expect(formatDayCount(3)).toBe('3 days');
  });
});

describe('initials', () => {
  it('takes the first letter of a single name', () => {
    expect(initials('Mithin')).toBe('M');
  });

  it('takes first and last letters of a full name', () => {
    expect(initials('Mithin Sagar S')).toBe('MS');
  });

  it('returns an empty string for empty input', () => {
    expect(initials('')).toBe('');
  });

  it('collapses repeated internal whitespace', () => {
    expect(initials('  Mithin   Sagar  ')).toBe('MS');
  });
});

describe('formatDuration', () => {
  it('shows an em dash for null', () => {
    expect(formatDuration(null)).toBe('—');
  });

  it('shows an em dash for NaN', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  it('shows "<1h" below one hour', () => {
    expect(formatDuration(0.5)).toBe('<1h');
  });

  it('rounds to the nearest hour under 48h', () => {
    expect(formatDuration(47.6)).toBe('48h');
  });

  it('switches to days at 48h and beyond', () => {
    expect(formatDuration(48)).toBe('2.0d');
  });
});

describe('formatRelative', () => {
  const NOW = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads "just now" under a minute ago', () => {
    expect(formatRelative(new Date(NOW.getTime() - 30_000))).toBe('just now');
  });

  it('reads minutes ago under an hour', () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * 60_000))).toBe('5m ago');
  });

  it('reads hours ago under a day', () => {
    expect(formatRelative(new Date(NOW.getTime() - 4 * 60 * 60_000))).toBe('4h ago');
  });

  it('reads "yesterday" at exactly one day', () => {
    expect(formatRelative(new Date(NOW.getTime() - 24 * 60 * 60_000))).toBe('yesterday');
  });

  it('reads days ago under a month', () => {
    expect(formatRelative(new Date(NOW.getTime() - 5 * 24 * 60 * 60_000))).toBe('5d ago');
  });

  it('falls back to an absolute date beyond a month', () => {
    const beyondAMonth = new Date(NOW.getTime() - 40 * 24 * 60 * 60_000);
    expect(formatRelative(beyondAMonth)).toBe('15 Jul 2026');
  });
});

describe('nameColorIndex', () => {
  it('is deterministic for the same name', () => {
    expect(nameColorIndex('Mithin Sagar S')).toBe(nameColorIndex('Mithin Sagar S'));
  });

  it('stays within the requested bucket range', () => {
    const index = nameColorIndex('Mithin Sagar S', 6);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(6);
  });

  it('respects a custom bucket count', () => {
    const index = nameColorIndex('Resident', 3);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(3);
  });
});

describe('buildQueryString', () => {
  it('returns an empty string for no params', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('skips undefined, null, and empty-string values', () => {
    expect(buildQueryString({ a: undefined, b: null, c: '', d: 'x' })).toBe('?d=x');
  });

  it('joins array values with commas', () => {
    expect(buildQueryString({ status: ['OPEN', 'IN_PROGRESS'] })).toBe('?status=OPEN%2CIN_PROGRESS');
  });

  it('omits an empty array entirely', () => {
    expect(buildQueryString({ status: [], q: 'leak' })).toBe('?q=leak');
  });

  it('stringifies numbers and booleans', () => {
    expect(buildQueryString({ page: 2, urgent: true })).toBe('?page=2&urgent=true');
  });
});
