# System Design — Society Maintenance Tracker

*Assignment deliverable — 792 words (limit 800).*

## Complaint history model

Status and priority changes are the same kind of fact: *actor X changed field F from A to B at time T, with an optional note.* Rather than two near-identical history tables joined by a `UNION` on every detail page, there is one append-only log, `complaint_events`, with a `type` discriminator. The assignment's "status history" is `WHERE type = 'STATUS_CHANGED'`; the complaint timeline is the whole table for one complaint, in one ordered query.

A `CREATED` event (`from_status = NULL → OPEN`) opens every trail, so a complaint's entire lifecycle is reconstructible from the log alone. `complaints.status` is a materialised convenience column for indexing and filtering; the log is the record of truth. `actor_role` is **snapshotted** on each row — if a user's role changes later, the audit trail still records what they were when they acted.

Immutability is enforced at the database, not by convention. A trigger raises on `UPDATE` or `DELETE` against `complaint_events`. The service layer exposes no mutation path either, but a trigger survives refactors, bugs and stray `psql` sessions. A `CHECK` constraint also requires each event type to carry exactly the fields it is about.

Every status change updates the complaint and appends its event in one transaction, opened with `SELECT … FOR UPDATE` — without that lock two admins clicking at once could both read `OPEN`, both consider the transition valid, and both write an event.

## Overdue detection

```
overdue  ⇔  status ≠ RESOLVED  ∧  now − created_at > threshold
```

Overdue is **derived, never stored**. A boolean column would need a nightly job to stay true, would go stale the moment the threshold changed, and would create a second source of truth free to disagree with the first. Deriving it means changing the threshold from 7 days to 3 instantly reclassifies every complaint, with no migration and no backfill.

The threshold lives in `app_settings`, editable by an admin at runtime; `OVERDUE_THRESHOLD_DAYS` only seeds the initial row — a stronger reading of "configurable" than an env var requiring a redeploy.

`src/lib/overdue.ts` is the single source of truth: the in-memory serializer and the SQL predicate both derive from it, so badge and filter cannot drift. A partial index — `(created_at) WHERE status <> 'RESOLVED'` — covers exactly the rows the predicate touches and stays small as the resolved archive grows. Verified on 20,000 rows: index scan, not sequential. No background job is needed; resolved complaints are excluded by definition.

## Photo handling

Two-step signed direct upload. The browser validates type and size, downscales to a 1600px longest edge on a canvas, then requests a scoped signature from `POST /api/uploads/signature` and uploads **directly to Cloudinary**. This is not only a performance choice: Vercel caps a serverless request body at 4.5 MB, so proxying a 5 MB photo through a route handler would simply fail.

Because the client briefly holds an upload permission, the signature is scoped to a fixed folder with an allowed-format list, and the returned `public_id` is untrusted input — the server re-reads the asset from Cloudinary and confirms it is an image within limits before persisting anything.

Postgres stores a URL, `public_id` and intrinsic dimensions; never bytes. BLOBs inflate every backup, consume a connection to serve each image, and forfeit CDN caching and transforms. Dimensions let the UI reserve space and avoid layout shift. `StorageProvider` is an interface with a local-disk implementation, so the product runs with no third-party credentials.

## Notification flow

Email never participates in the database transaction:

```
tx: update complaint → insert event → insert email_outbox(PENDING) → COMMIT
after commit: dispatch → SENT | FAILED (attempts++, lastError)
```

Committing the *intent* alongside the domain change means a notification can never be silently lost — a process that dies before dispatch leaves a `PENDING` row to retry. Dispatching after commit means a provider outage degrades to "the update worked, the email did not", which the API reports honestly (`meta.notification.delivered`) and the UI shows as a soft warning. Important notices fan out one row per recipient, so a bad address fails alone. The admin Email Log reads the outbox, making delivery auditable.

## Authentication, API and deployment

Opaque 32-byte session tokens in an `httpOnly`, `sameSite=lax` cookie; only an HMAC is stored, so a database leak yields no live sessions. Chosen over JWT because every authorised request already loads the user to check their role — statelessness would buy nothing while costing real revocation. Passwords are bcrypt cost 12; login returns one message for both failure modes and equalises timing to prevent enumeration.

Edge middleware only redirects; **every** authorisation decision is re-made server-side by `requireUser` / `requireAdmin`. A resident requesting another's complaint gets `404`, not `403` — the latter would confirm the record exists.

REST with one response envelope and one error mapper; filtering, sorting and pagination execute as SQL. Deployment is Next.js on Vercel, Postgres on Neon, images on Cloudinary, email via Resend — one deployable unit, four managed services.
