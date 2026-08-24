# API Reference

Base URL: `{APP_URL}/api` · All requests and responses are JSON.

## Conventions

### Authentication

Every endpoint except `register` and `login` requires a valid session. The session is an opaque token in an `httpOnly` cookie (`smt_session`) set by the login response; browsers send it automatically. From `curl`, use a cookie jar:

```bash
curl -c jar.txt -X POST $APP_URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@greenwoodheights.in","password":"Admin@12345"}'

curl -b jar.txt $APP_URL/api/admin/dashboard
```

### Response envelope

Every response uses one of two shapes.

```jsonc
// success
{ "data": { … } }

// success, list endpoints
{ "data": [ … ],
  "meta": { "page": 1, "pageSize": 20, "total": 137, "totalPages": 7, "hasNextPage": true } }

// error
{ "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": [{ "path": "description", "message": "Describe the issue in at least 20 characters…" }],
    "requestId": "3f2a…"          // 5xx only — matches a server log line
} }
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Body or query failed schema validation. `details` lists the fields. |
| `UNAUTHORIZED` | 401 | No session, or the session expired. |
| `FORBIDDEN` | 403 | Authenticated, but the role is not permitted. |
| `NOT_FOUND` | 404 | No such resource — **or** it exists but belongs to another resident. |
| `CONFLICT` | 409 | Unique constraint or referential conflict (e.g. duplicate email). |
| `INVALID_TRANSITION` | 409 | The lifecycle forbids this status change. |
| `RATE_LIMITED` | 429 | Too many attempts. `Retry-After` header included. |
| `UPLOAD_FAILED` | 400 | The image failed validation or could not be verified. |
| `INTERNAL_ERROR` | 500 | Unexpected. Logged in full server-side; only a `requestId` is returned. |

> **Note on 404 vs 403.** A resident requesting another resident's complaint receives `404`, not `403`. A `403` would confirm the resource exists, which is itself a disclosure. Admin-only *routes* return `403`, because their existence is not secret.

### Derived fields

Every serialized complaint carries computed overdue state. These are **not** database columns — they are derived on read from `(status, createdAt, appSettings.overdueThresholdDays)`.

| Field | Meaning |
|---|---|
| `isOverdue` | Not resolved, and older than the threshold |
| `daysOpen` | Days open, or days taken to resolve if closed |
| `overdueByDays` | Days past the threshold; `0` when not overdue |
| `dueAt` | ISO timestamp at which it becomes overdue |
| `allowedTransitions` | Statuses the server will accept next; `[]` when closed |

---

## Authentication

### `POST /api/auth/register`
Creates a resident account and signs in. Rate limited (5 / hour / IP).

**Auth:** none

```jsonc
// request
{ "fullName": "Ananya Iyer", "email": "ananya@example.com",
  "password": "Passw0rd", "flatNumber": "A-402", "phone": "+91 98450 11234" }  // phone optional
```

`role` is **not** accepted. Every account created here is a `RESIDENT`; supplying `role: "ADMIN"` is ignored.

| Response | |
|---|---|
| `201` | `{ "data": { "user": {…} } }`, sets `smt_session` |
| `422` | Validation failed (weak password, bad email, missing flat) |
| `409` | Email already registered — `details[0].path = "email"` |
| `429` | Rate limited |

### `POST /api/auth/login`
Rate limited (8 / 5 min / IP), checked *before* the password hash is computed.

```jsonc
{ "email": "admin@greenwoodheights.in", "password": "Admin@12345" }
```

| Response | |
|---|---|
| `200` | `{ "data": { "user": {…} } }`, sets `smt_session` |
| `401` | `Incorrect email or password.` — identical for unknown email and wrong password |
| `429` | Rate limited |

### `POST /api/auth/logout`
Deletes the session row server-side and clears the cookie. Idempotent. → `200`

### `GET /api/auth/me`
→ `200 { "data": { "user": {…}, "sessionExpiresAt": "…" } }` · `401` if not signed in

### `PATCH /api/auth/profile`
Updates the **caller's own** record. The user id comes from the session; there is no id in the body to tamper with.

```jsonc
{ "fullName": "Ananya Iyer", "flatNumber": "A-402", "phone": "+91 98450 11234" }
```
→ `200 { "data": { "user": {…} } }` · `422`

### `POST /api/auth/change-password`
On success, **all** sessions are destroyed and a fresh one is issued for this device.

```jsonc
{ "currentPassword": "…", "newPassword": "…" }
```
→ `200 { "data": { "success": true, "signedOutOtherDevices": true } }` · `422` if the current password is wrong

---

## Complaints (resident)

### `GET /api/complaints`
The caller's own complaints. The resident id is applied in the SQL `WHERE` clause — no query parameter can widen the result.

**Query parameters**

| Param | Type | Notes |
|---|---|---|
| `q` | string | Substring match on reference, title, description |
| `status` | enum(s) | `OPEN` · `IN_PROGRESS` · `RESOLVED`. Comma-separated for multiple |
| `category` | enum(s) | See category list below |
| `priority` | enum(s) | `LOW` · `MEDIUM` · `HIGH` |
| `overdue` | `true`/`false` | Restrict to, or exclude, overdue |
| `from`, `to` | date | `YYYY-MM-DD`, inclusive of the whole `to` day |
| `sort` | enum | `createdAt` (default) · `updatedAt` · `priority` · `status` · `reference` |
| `order` | enum | `asc` · `desc` (default) |
| `page` | int | ≥ 1, default 1 |
| `pageSize` | int | 1–100, default 20 |

→ `200 { "data": [Complaint], "meta": {…} }`

### `POST /api/complaints`

```jsonc
{ "title": "No water supply in the morning hours",
  "description": "At least 20 characters…",
  "category": "WATER_SUPPLY",
  "photo": { "publicId": "…", "url": "…", "width": 1600, "height": 1200 }  // optional
}
```

The `photo.publicId` is re-verified against the storage provider before anything is persisted. → `201 { "data": Complaint }` · `422` · `400 UPLOAD_FAILED`

### `GET /api/complaints/:id`
Owner **or** admin. → `200 { "data": Complaint }` · `404` · `422` (malformed uuid)

### `GET /api/complaints/:id/history`
The complete immutable audit trail, **oldest first**.

```jsonc
{ "data": [
  { "id": "…", "type": "CREATED",
    "fromStatus": null, "toStatus": "OPEN",
    "fromPriority": null, "toPriority": null, "note": null,
    "actor": { "id": "…", "fullName": "Ananya Iyer", "role": "RESIDENT" },
    "createdAt": "2026-08-10T04:30:00.000Z" },
  { "type": "STATUS_CHANGED", "fromStatus": "OPEN", "toStatus": "IN_PROGRESS",
    "note": "Plumber assigned for tomorrow morning.",
    "actor": { "fullName": "Suresh Menon", "role": "ADMIN" }, … },
  { "type": "PRIORITY_CHANGED", "fromPriority": "MEDIUM", "toPriority": "HIGH", … }
] }
```

`actor.role` is the role recorded **at the time of the action**, not the actor's current role.

---

## Complaints (admin)

### `GET /api/admin/complaints`
**Auth:** `ADMIN`. Every complaint. Same query parameters as `GET /api/complaints`, plus a resident column in each row.

The default ordering answers *what needs attention?* — overdue first, then by priority, then oldest within a band. Supplying `sort`/`order` overrides it.

→ `200 { "data": [Complaint], "meta": {…} }` · `403`

### `PATCH /api/admin/complaints/:id/status`
**Auth:** `ADMIN`

```jsonc
{ "status": "IN_PROGRESS", "note": "Optional, ≤1000 chars — included in the resident's email" }
```

Validates the transition, updates the complaint, appends the audit event, and queues the notification — all in one transaction. Delivery is attempted **after** commit.

```jsonc
// 200
{ "data": Complaint,
  "meta": { "notification": { "attempted": true, "delivered": false } } }
```

`delivered: false` means the complaint **was** updated but the email did not go out. Check Admin → Email log.

**Lifecycle**

```
OPEN ──→ IN_PROGRESS ──→ RESOLVED   (terminal)
  └────────────────────────↑
```

| From → To | Result |
|---|---|
| `OPEN` → `IN_PROGRESS` / `RESOLVED` | ✅ |
| `IN_PROGRESS` → `RESOLVED` | ✅ |
| `IN_PROGRESS` → `OPEN` | ❌ `409 INVALID_TRANSITION` |
| `RESOLVED` → anything | ❌ `409` — *"Resolved complaints cannot be reopened."* |
| Same status again | ❌ `409` |

### `PATCH /api/admin/complaints/:id/priority`
**Auth:** `ADMIN`

```jsonc
{ "priority": "HIGH", "note": "Escalated after inspection." }
```

Recorded in the same audit trail as status changes. Setting the priority it already has is a **no-op**, not an error — it must not add a meaningless audit entry. → `200 { "data": Complaint }`

### `GET /api/admin/dashboard`
**Auth:** `ADMIN`. All figures aggregated in Postgres; the independent queries run concurrently.

```jsonc
{ "data": {
  "totals": { "total": 23, "open": 7, "inProgress": 4, "resolved": 12,
              "overdue": 5, "unassignedHighPriority": 5,
              "resolvedThisWeek": 5, "avgResolutionHours": 81.4 },
  "statusBreakdown":   [{ "status": "OPEN", "label": "Open", "count": 7 }, …],
  "categoryBreakdown": [{ "category": "PLUMBING", "label": "Plumbing", "count": 4, "openCount": 1 }, …],
  "priorityBreakdown": [{ "priority": "HIGH", "count": 7 }, …],
  "trend":             [{ "date": "2026-07-25", "raised": 1, "resolved": 0 }, …],  // 31 points, no gaps
  "overdueQueue":      [Complaint],                                                // top 8
  "recentActivity":    [ActivityItem],                                             // last 10
  "overdueThresholdDays": 7
} }
```

---

## Notices

### `GET /api/notices`
**Auth:** any signed-in user. Important notices are returned **first** (`is_important DESC, published_at DESC`).

| Param | Notes |
|---|---|
| `page`, `pageSize` | Standard pagination |
| `includeArchived` | Honoured **only for admins**; residents always see the live board |

→ `200 { "data": [Notice], "meta": {…} }`

### `POST /api/admin/notices`
**Auth:** `ADMIN`

```jsonc
{ "title": "Water tanker schedule revised", "body": "…", "isImportant": true }
```

When `isImportant` is true, one outbox row is queued **per active resident** and dispatched after the notice commits.

```jsonc
// 201
{ "data": { …Notice, "notification": { "recipients": 12, "delivered": 12 } } }
```

### `PATCH /api/admin/notices/:id`
**Auth:** `ADMIN`. Partial: any of `title`, `body`, `isImportant`. → `200 { "data": Notice }` · `404`

### `DELETE /api/admin/notices/:id`
**Auth:** `ADMIN`. **Archives** (soft delete) — sets `archived_at`, keeps the row. Notices are community record. Archived notices disappear from the resident board. → `200 { "data": { "success": true, "archived": true } }`

---

## Settings

### `GET /api/admin/settings`
**Auth:** `ADMIN` → `200 { "data": { "id": 1, "societyName": "…", "overdueThresholdDays": 7, … } }`

### `PATCH /api/admin/settings`
**Auth:** `ADMIN`

```jsonc
{ "societyName": "Greenwood Heights", "overdueThresholdDays": 5 }   // both optional
```

Changing `overdueThresholdDays` takes effect **immediately** across list filters, dashboard counts, badges and the overdue queue — because overdue is derived on read, not stored. No migration, no backfill. Range 1–365; outside that → `422`.

---

## Uploads

### `POST /api/uploads/signature`
**Auth:** any signed-in user. Rate limited (30 / hour / user).

```jsonc
{ "contentType": "image/jpeg", "byteSize": 842113 }
```

```jsonc
// 200 — Cloudinary configured
{ "data": { "provider": "cloudinary",
            "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
            "fields": { "api_key": "…", "timestamp": "…", "folder": "…",
                        "allowed_formats": "jpg,jpeg,png,webp", "signature": "…" } } }

// 200 — local disk provider (no Cloudinary credentials)
{ "data": { "provider": "local", "uploadUrl": "/api/uploads/local", "fields": { "token": "…" } } }
```

The browser POSTs the file directly to `uploadUrl`. **The API secret never leaves the server.** Errors: `400 UPLOAD_FAILED` (bad type or >5 MB), `429`.

### `POST /api/uploads/local`
**Auth:** any signed-in user. Only active when Cloudinary is not configured. `multipart/form-data` with a `file` field. Validates the file's **magic bytes**, not just its declared content type. → `200 { "data": { "publicId", "url", "width", "height" } }`

---

## Email log

### `GET /api/admin/emails`
**Auth:** `ADMIN`. Reads the transactional outbox — every notification the system generated, and what happened to it.

| Param | Notes |
|---|---|
| `status` | `PENDING` · `SENT` · `FAILED`, comma-separated |
| `page`, `pageSize` | pageSize ≤ 100, default 25 |

```jsonc
{ "data": [{ "id": "…", "recipientEmail": "…", "recipientName": "…",
             "type": "COMPLAINT_STATUS_CHANGED", "subject": "…",
             "status": "FAILED", "attempts": 1,
             "providerMessageId": null,
             "lastError": "Provider responded 422: recipient domain rejected the message",
             "complaintId": "…", "noticeId": null,
             "createdAt": "…", "sentAt": null }],
  "meta": { …pagination, "summary": { "PENDING": 0, "SENT": 24, "FAILED": 2 } } }
```

---

## Enumerations

**Status** `OPEN` · `IN_PROGRESS` · `RESOLVED`
**Priority** `LOW` · `MEDIUM` · `HIGH`
**Role** `RESIDENT` · `ADMIN`
**Category** `PLUMBING` · `ELECTRICAL` · `CLEANING` · `SECURITY` · `ELEVATOR` · `WATER_SUPPLY` · `COMMON_AREA` · `PARKING` · `NOISE` · `PEST_CONTROL` · `OTHER`
**Email type** `COMPLAINT_STATUS_CHANGED` · `IMPORTANT_NOTICE`
**Email status** `PENDING` · `SENT` · `FAILED`
**Event type** `CREATED` · `STATUS_CHANGED` · `PRIORITY_CHANGED`
