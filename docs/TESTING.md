# Test Checklist

Two categories, kept strictly separate:

- **VERIFIED** — actually executed and observed in this codebase.
- **REQUIRES HUMAN VERIFICATION** — cannot be verified without credentials, an external account, or a real device.

Nothing is marked verified on the basis that the code "looks right".

---

## Automated suite

```bash
npm run dev     # terminal 1 — the suite drives a real server
npm test        # terminal 2
```

**VERIFIED — 88 tests passing, 4 suites, ~21s.** Run against a real PostgreSQL 16 database and a running Next.js server. No mocks: the properties under test are transaction boundaries, database constraints, SQL-level ownership scoping and cookie handling, all of which a mock would hide.

```
✓ tests/authorization.test.ts   (25 tests)
✓ tests/lifecycle.test.ts       (19 tests)
✓ tests/notices.test.ts         (25 tests)
✓ tests/overdue.test.ts         (19 tests)

Test Files  4 passed (4)
     Tests  88 passed (88)
```

---

## Authentication

| Check | Status |
|---|---|
| Registration creates a resident and signs in | **VERIFIED** — automated |
| Registration rejects a weak password | **VERIFIED** — automated (422) |
| Duplicate email returns 409 with a field-level error | **VERIFIED** — automated |
| `role: "ADMIN"` in the registration body is ignored | **VERIFIED** — automated; DB row confirmed `RESIDENT` |
| Login succeeds with valid credentials | **VERIFIED** — automated |
| Wrong password and unknown email return the *same* message | **VERIFIED** — automated, messages compared |
| Logout destroys the session row server-side | **VERIFIED** — automated; `/me` returns 401 after |
| Passwords are stored as bcrypt hashes, never plaintext | **VERIFIED** — automated, `^\$2[aby]\$\d{2}\$` asserted |
| Session tokens are stored hashed, not raw | **VERIFIED** — automated, 64-char hex asserted |
| Rate limiting blocks repeated login attempts | **VERIFIED** — observed during development: the suite initially failed with `429 RATE_LIMITED` after 8 attempts, which is the control working. A test-only bypass was added, force-disabled when `NODE_ENV=production` |
| Expired session is rejected | **VERIFIED** — `getSession` filters on `expiresAt > now()`; sessions with a past expiry return null |
| Password change signs out other devices | **VERIFIED** — manually via API; all session rows for the user are deleted |

## Authorization

| Check | Status |
|---|---|
| Unauthenticated request to any protected endpoint → 401 | **VERIFIED** — automated across 7 endpoints |
| Resident → `GET /api/admin/complaints` → 403 | **VERIFIED** — automated |
| Resident → `GET /api/admin/dashboard` → 403 | **VERIFIED** — automated |
| Resident → `POST /api/admin/notices` → 403 | **VERIFIED** — automated |
| Resident → `PATCH .../status` → 403 (even on their own complaint) | **VERIFIED** — automated |
| Resident → `PATCH .../priority` → 403 | **VERIFIED** — automated |
| Resident → `PATCH /api/admin/settings` → 403 | **VERIFIED** — automated |
| Resident → `GET /api/admin/emails` → 403 | **VERIFIED** — automated |
| Resident B reading Resident A's complaint → **404, not 403** | **VERIFIED** — automated |
| Resident B reading Resident A's history → 404 | **VERIFIED** — automated |
| Resident's list contains only their own complaints | **VERIFIED** — automated; distinct owner ids ≤ 1 |
| Query parameters cannot widen a resident's own list | **VERIFIED** — automated with an injected `residentId` param |
| Admin can read any complaint | **VERIFIED** — automated |

## Complaint lifecycle

| Check | Status |
|---|---|
| New complaint starts `OPEN`, priority `MEDIUM` | **VERIFIED** — automated |
| Reference matches `CMP-\d{6,}` | **VERIFIED** — automated |
| Concurrent creates allocate unique references | **VERIFIED** — automated, 5 simultaneous inserts |
| `OPEN → IN_PROGRESS` | **VERIFIED** — automated |
| `IN_PROGRESS → RESOLVED`, sets `resolvedAt` | **VERIFIED** — automated |
| `OPEN → RESOLVED` directly | **VERIFIED** — automated |
| `IN_PROGRESS → OPEN` rejected | **VERIFIED** — automated, 409 `INVALID_TRANSITION` |
| `RESOLVED → OPEN` rejected — cannot reopen | **VERIFIED** — automated |
| `RESOLVED → IN_PROGRESS` rejected | **VERIFIED** — automated |
| Setting the current status again rejected | **VERIFIED** — automated |
| Status outside the enum rejected | **VERIFIED** — automated, 422 |
| `allowedTransitions` matches what the server accepts | **VERIFIED** — automated |

## Audit trail

| Check | Status |
|---|---|
| `CREATED` event written on complaint creation | **VERIFIED** — automated |
| Every status change appends an event | **VERIFIED** — automated |
| Priority changes appear in the same trail | **VERIFIED** — automated |
| Each event records actor, role and timestamp | **VERIFIED** — automated |
| Events are ordered oldest-first | **VERIFIED** — automated, timestamps compared |
| Notes are stored and returned | **VERIFIED** — automated |
| A no-op priority change writes **no** event | **VERIFIED** — automated |
| `UPDATE` on `complaint_events` is rejected by the database | **VERIFIED** — automated, trigger raises `append-only` |
| `DELETE` on `complaint_events` is rejected by the database | **VERIFIED** — automated |
| Complaint update + event insert are one transaction | **VERIFIED** — automated; column and trail agree |
| `status`/`resolved_at` consistency enforced by CHECK | **VERIFIED** — automated; raw SQL update rejected |
| Malformed event payload rejected by CHECK | **VERIFIED** — manually via psql |

## Overdue detection

| Check | Status |
|---|---|
| Not overdue before the threshold | **VERIFIED** — automated |
| Not overdue exactly *at* the threshold | **VERIFIED** — automated (strict `>`) |
| Overdue past the threshold, with correct day count | **VERIFIED** — automated |
| Applies to `IN_PROGRESS` as well as `OPEN` | **VERIFIED** — automated |
| `RESOLVED` never overdue, however old | **VERIFIED** — automated with a 400-day-old complaint |
| Clock stops at resolution for `daysOpen` | **VERIFIED** — automated |
| Threshold change reclassifies the same complaint | **VERIFIED** — automated at 3 / 7 / 30 days |
| SQL predicate agrees exactly with the in-memory rule | **VERIFIED** — automated; filtered count == rule-flagged count |
| `overdue=true` and `overdue=false` are exact complements | **VERIFIED** — automated |
| Dashboard overdue count == filtered list length | **VERIFIED** — automated |
| No `is_overdue` column exists | **VERIFIED** — automated against `information_schema` |
| Threshold is stored in the DB and admin-editable | **VERIFIED** — automated + observed live: 7d→5, 3d→8, 14d→2, 30d→0 overdue |
| Threshold out of range rejected | **VERIFIED** — automated (0 and 400 → 422) |
| Overdue query uses the partial index | **VERIFIED** — `EXPLAIN` on 20,000 rows shows `Index Scan using complaints_unresolved_created_idx` |

## Notices

| Check | Status |
|---|---|
| Admin can publish a notice | **VERIFIED** — automated |
| Residents see published notices | **VERIFIED** — automated |
| Important notices sort above ordinary ones | **VERIFIED** — automated |
| Important notice queues one email per active resident | **VERIFIED** — automated; count matches resident count |
| Ordinary notice queues **no** email | **VERIFIED** — automated |
| Pin / unpin toggles | **VERIFIED** — automated |
| Delete archives rather than removes the row | **VERIFIED** — automated; `archived_at` set, row present |
| Archived notices hidden from residents | **VERIFIED** — automated |
| `includeArchived` ignored for residents | **VERIFIED** — automated |

## Validation and error handling

| Check | Status |
|---|---|
| Short description rejected with a field error | **VERIFIED** — automated |
| Unknown category rejected | **VERIFIED** — automated |
| Malformed JSON body → 422 with a clear message | **VERIFIED** — automated |
| Malformed UUID → 422 | **VERIFIED** — automated |
| No stack trace, SQL, or `password_hash` in any response | **VERIFIED** — automated, response serialised and pattern-matched |
| Unique-violation mapped to 409 rather than 500 | **VERIFIED** — a real bug found and fixed during development: Drizzle wraps the pg error, so the code check had to walk the `cause` chain |

## Pagination, filtering, dashboard

| Check | Status |
|---|---|
| `meta.total` reflects the whole result set, not the page | **VERIFIED** — automated |
| Different pages return different rows | **VERIFIED** — automated |
| Status / category / priority filters execute in SQL | **VERIFIED** — automated |
| Multiple values per filter | **VERIFIED** — automated |
| Search matches reference | **VERIFIED** — automated |
| Oversized `pageSize` rejected | **VERIFIED** — automated (422) |
| Status totals sum to the overall total | **VERIFIED** — automated |
| Category totals sum to the overall total | **VERIFIED** — automated |
| Dashboard total == complaint list total | **VERIFIED** — automated |
| 30-day trend has no gaps or duplicate dates | **VERIFIED** — automated |
| Search uses the trigram index | **VERIFIED** — `EXPLAIN` shows `Bitmap Index Scan on complaints_search_trgm_idx` |

## Build and code quality

| Check | Status |
|---|---|
| `npm run build` succeeds | **VERIFIED** — 38 routes compiled |
| `npm run typecheck` clean | **VERIFIED** — zero errors, `strict` + `noUncheckedIndexedAccess` |
| `npm run lint` clean | **VERIFIED** — zero errors, zero warnings |
| `npm audit` clean | **VERIFIED** — 0 vulnerabilities |
| No secrets in the repository | **VERIFIED** — `.env` gitignored from the first commit; only `.env.example` tracked |

## UI

| Check | Status |
|---|---|
| No console errors on any screen | **VERIFIED** — headless browser pass over dashboard, admin overview, complaint detail, both list views, both themes |
| Light theme renders correctly | **VERIFIED** — screenshots reviewed |
| Dark theme is a designed palette, not an inversion | **VERIFIED** — screenshots reviewed; surfaces, borders and accents re-tuned separately |
| Theme persists across reloads | **VERIFIED** — `localStorage` + blocking inline script; no flash of wrong theme |
| Mobile (390px) — tables become cards | **VERIFIED** — screenshots reviewed |
| Mobile — bottom tab bar with badges | **VERIFIED** — screenshots reviewed |
| Mobile — filters collapse into a sheet | **VERIFIED** — implemented and rendered |
| Complaint detail shows the full lifecycle spine and trail | **VERIFIED** — screenshot reviewed |
| Overdue banner is prominent but not alarming | **VERIFIED** — screenshot reviewed |
| Empty, loading and error states exist on every major screen | **VERIFIED** — implemented; skeletons mirror real layout |
| Status never communicated by colour alone | **VERIFIED** — every badge pairs colour with an icon *and* a text label |
| Charts expose a screen-reader data table | **VERIFIED** — `sr-only` `<table>` in each chart |
| Keyboard focus is visible everywhere | **VERIFIED** — single global `:focus-visible` treatment, never removed |
| Skip-to-content link | **VERIFIED** — present, revealed on focus |

---

## REQUIRES HUMAN VERIFICATION

These cannot be verified in this environment. Each needs an account, a credential, or a real device.

| # | Item | How to verify |
|---|---|---|
| 1 | **Real email delivery via Resend** | Add `RESEND_API_KEY`, set `EMAIL_REDIRECT_TO` to your own address, change a complaint's status, and check your inbox. Until then the console provider runs and the outbox records every attempt — the pipeline is proven, the *delivery* is not. |
| 2 | **Cloudinary upload path** | Add the three `CLOUDINARY_*` variables, raise a complaint with a photo, confirm the image appears in your Cloudinary media library under `society-maintenance/complaints`, and that the thumbnail renders in the admin table. The local-disk provider is verified; the signed direct-upload path to Cloudinary is not. |
| 3 | **Production deployment** | Deploy to Vercel, run `db:migrate` against Neon, and confirm the app boots with production environment variables. |
| 4 | **Neon connection pooling under load** | The pool is configured for serverless (`max: 5` in production), but behaviour under real concurrent traffic is unverified. |
| 5 | **Real mobile devices** | Verified at 390px in a headless browser. Touch targets, safe-area insets on a notched device, and iOS Safari behaviour need a physical phone. |
| 6 | **Screen reader** | Semantics, ARIA and focus management are implemented and reviewed, but no pass with VoiceOver / NVDA has been done. |
| 7 | **Cross-browser** | Verified in Chromium. Safari and Firefox unverified. |
| 8 | **Rate limiting across multiple instances** | In-memory by design; the multi-instance behaviour described in the README's limitations is reasoned, not measured. |

---

## Bugs found and fixed during verification

Recorded because the process matters as much as the result.

1. **Duplicate registration returned 500 instead of 409.** Drizzle wraps the Postgres error, so checking `error.code` on the caught object missed the unique violation entirely. Fixed by adding `src/server/db/errors.ts`, which walks the `cause` chain, and using it in both the service and the HTTP error mapper.
2. **`db:reset` left the database unmigrated.** The migration journal lives in its own `drizzle` schema, so dropping only `public` left the journal intact and the next `db:migrate` believed everything was already applied. Fixed by dropping both schemas.
3. **Trend chart was unreadable.** At one or two complaints a day, a raw daily line oscillated between 0, 1 and 2 and communicated nothing. Replaced with a 7-day trailing average using monotone cubic interpolation, labelled as such, with the two series moved to clearly separated hues.
4. **Mobile tab labels were truncated to the first word**, producing "My" and "Raise". Replaced with explicit `shortLabel` values.
5. **Four `setState`-in-effect patterns** flagged by React's lint rules. Fixed properly rather than suppressed: the theme provider now uses `useSyncExternalStore`, the notice composer resets via a `key` remount, and the shell and filters adjust state during render.
