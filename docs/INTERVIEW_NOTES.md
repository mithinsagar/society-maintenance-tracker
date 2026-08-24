# How to Explain This Project in the Interview

Not a script to memorise. These are the arguments behind each decision — read them, then say them in your own words. If an interviewer pushes back on something, the honest answer is usually "here's the trade-off I made and here's what I'd do differently at scale", not a defence.

**The one thing to lead with:** most submissions for this brief are CRUD over four tables. What makes this one different is that the *hard* parts are handled as hard parts — the audit trail is immutable at the database level, overdue is derived rather than stored, and email is decoupled from the transaction that triggers it. Steer toward those three.

---

## Stack

**Why Next.js rather than a separate Express API and React app?**

One deployable unit instead of two. A split repo doubles the deployment surface, adds CORS configuration, and means two things to keep in sync — for no benefit an evaluator can see. Route Handlers are a real HTTP API: I can curl them, they're documented endpoint by endpoint, and the integration tests hit them over HTTP rather than importing functions. Server Components also let a dashboard render from a single database round-trip instead of a client fetch waterfall — the admin overview issues seven aggregate queries concurrently on the server and ships finished HTML.

The API is still cleanly layered. Route handlers are about fifteen lines each: parse, authorize, delegate, respond. Everything that decides what the product *does* is in `src/server/services/`, so the lifecycle rules are testable without an HTTP layer at all.

**Why PostgreSQL?**

The domain is relational and the requirements are relational. Ownership, an audit trail with foreign keys, referential rules about what may be deleted. I also lean on Postgres for things a document store can't do: real enums, CHECK constraints, a partial index for the overdue predicate, a trigram GIN index for search, `GROUP BY … FILTER` aggregates for the dashboard, and triggers to make the audit trail immutable. Half my correctness guarantees are database features.

**Why Drizzle rather than Prisma?**

Two reasons. Migrations are plain `.sql` files I wrote and can review — for a project graded on schema design, showing real DDL with the constraints and triggers visible is a feature, not a detail. And there's no native query engine to download, which means a smaller serverless bundle and a faster cold start on Vercel.

*(If asked why not Prisma specifically: I'd started with Prisma. Its engine binaries download from a host that wasn't reachable from my build environment, so I switched. I'd have made the same call for the migration-readability reason anyway, but I want to be straight that the environment forced the timing.)*

---

## Data model

**Why one event table instead of a `ComplaintStatusHistory` table?**

Status changes and priority changes are the same shape of fact: actor X changed field F from A to B at time T, with an optional note. Two near-identical tables would mean a `UNION` every time I render a timeline, and two places to keep in sync. One `complaint_events` table with a `type` discriminator gives me the whole timeline as a single ordered query, and the "status history" the brief asks for is just `WHERE type = 'STATUS_CHANGED'`.

The `CREATED` event matters more than it looks — it records `null → OPEN` at creation, which means the complete lifecycle is reconstructible from the log alone. Without it the trail would start at the first admin action and the complaint's own origin would be implicit.

**Is the history actually immutable, or is that just a convention?**

It's enforced by the database. There's a trigger on `complaint_events` that raises an exception on any `UPDATE` or `DELETE`. The service layer has no mutation path either, but that's a promise about code that exists today — a trigger survives refactors, bugs, and someone with a psql prompt. There's a test that runs a raw `UPDATE` against the table and asserts it throws.

The consequence I had to accept: my seed script has to explicitly `DISABLE TRIGGER` to wipe demo data. I left that friction in deliberately. Destroying an audit trail should be a conscious act.

**Why snapshot `actor_role` instead of joining to the user?**

If someone is promoted from resident to admin later, a join would rewrite history — every past action would suddenly show them as an admin. An audit record should say what someone *was* when they acted.

**What indexes did you create and why?**

Every index serves a specific query; I didn't add any speculatively.

The one worth talking about is `complaints_unresolved_created_idx` — a *partial* index on `created_at WHERE status <> 'RESOLVED'`. The overdue predicate only ever touches unresolved complaints, and over time the resolved archive becomes most of the table, so a partial index stays small while a full one would keep growing. I checked the plan on 20,000 rows: it's an index scan, not a sequential scan.

The other is a trigram GIN index for search. Admin search is a substring match, and `ILIKE '%term%'` can't use a B-tree at all. A trigram index turns it into a bitmap index scan. Past roughly a million rows I'd move to a `tsvector` column with ranked results.

**What happens if a resident is deleted?**

They can't be. `complaints.resident_id` is `ON DELETE RESTRICT`, because deleting the resident would orphan an audit trail. Deactivation via `is_active = false` is the supported path — it also kills their sessions immediately rather than waiting for expiry. I made a deliberate decision per relationship: cascade for sessions, restrict for anything that would orphan history, soft delete for notices because they're community record and a resident may have acted on one.

---

## Overdue detection

**How is overdue calculated?**

`status ≠ RESOLVED AND now − created_at > threshold`. It's derived on read, never stored.

**Why not store it?**

Three problems with a boolean column. It needs a nightly job to stay true. It goes stale the instant someone changes the threshold. And it becomes a second source of truth that's free to disagree with the first — you end up with a dashboard count that doesn't match the list it links to.

Deriving it means an admin changes the threshold from 7 days to 3 in Settings and every complaint reclassifies instantly — the list filter, the dashboard KPI, the badge on the detail page, the overdue queue. No migration, no backfill.

The thing I'm proudest of there: the Settings screen previews how many complaints would be overdue at each candidate threshold *before* you save. That's only possible because the value is derived. If it were a column, answering that question would itself require a backfill.

**Where does the rule live?**

`src/lib/overdue.ts`, and only there. The SQL filter builder, the API serializer and the UI badge all call into it. There's a test that asserts the SQL predicate and the in-memory rule return the same set — if they ever drift, that's the test that fails.

**Why is the threshold in the database rather than an env var?**

The brief says "configurable number of days". An environment variable means a redeploy to change it, which isn't really configurable by the person who needs to configure it. `OVERDUE_THRESHOLD_DAYS` only seeds the initial row; the `app_settings` table is authoritative afterwards.

**Do you need a background job?**

Not for correctness — that's the point of deriving it. I'd add one for a daily overdue digest email to the committee, but that's a new feature, not a fix.

---

## Authentication and authorization

**Why sessions rather than JWT?**

Every authorized request already loads the user, because I need their role and their active status. So the "no database round-trip" advantage of a JWT would buy me nothing here — while costing the ability to revoke. With opaque sessions, logout actually ends the session, and changing your password genuinely signs you out everywhere. With a JWT, both of those are hopes about client behaviour.

There's also no algorithm-confusion class of bug to worry about.

**What's actually stored?**

The cookie carries 32 random bytes. The database stores an HMAC of that token, keyed with `AUTH_SECRET`. So a database leak doesn't hand an attacker live sessions — and rotating `AUTH_SECRET` invalidates every session at once, which is a useful property to have.

**How does role-based authorization work?**

Guards — `requireUser`, `requireAdmin` — called inside every route handler and every server component that touches protected data. They re-derive identity and role from the database on each request.

The important part is what *isn't* access control: there's edge middleware, but it only redirects. It runs before any database lookup and all it can see is whether a cookie exists — it can't tell whether that cookie is valid or belongs to an admin. Forging it gets you a redirect and nothing else.

**How do you stop a resident reading someone else's complaint?**

The ownership check is a SQL `WHERE` clause, not a filter applied after fetching. `listComplaintsForResident` pushes `resident_id = :me` into the query unconditionally, so no combination of query parameters can widen it — I have a test that tries.

For a single complaint, the service checks ownership and throws `NotFoundError` if it fails. Note: **404, not 403**. A 403 would confirm the record exists, which is itself a disclosure. Admin-only *routes* return 403, because the existence of an admin area isn't a secret — only its contents are.

**How do you prevent unauthorized status updates?**

Three layers. The endpoint is under `/api/admin/`, guarded by `requireAdmin`. The service re-checks the role itself, so it's safe even if someone wires it to a different route later. And the transition is validated against a lifecycle table. There's a test that calls the status endpoint as a resident, against their *own* complaint, and asserts 403.

**Anything else on the auth surface?**

Registration doesn't accept a role — it's hardcoded to `RESIDENT`. A checkbox hidden in the UI wouldn't help; the field would still be on the endpoint. Login returns one message for both "no such account" and "wrong password", and runs a dummy bcrypt comparison on the missing-user path so the timing doesn't leak which case it was.

---

## Photos

**How are photos stored, and why not in the database?**

Cloudinary. Postgres stores a URL, a `public_id` and the intrinsic dimensions.

Bytes in the database is a bad trade in four ways: it inflates every backup and `pg_dump`, it consumes a database connection to serve each image, it forfeits CDN caching, and it forfeits on-the-fly resizing. The admin table shows 96px thumbnails; with Cloudinary that's a transform URL, with bytea it'd be downloading full-size images to scale in the browser.

I store the dimensions specifically so the UI can reserve the right box before the image loads and avoid layout shift.

**Walk me through the upload.**

The browser validates type and size, downscales to a 1600px longest edge on a canvas, then asks my API for a signature and uploads *directly* to Cloudinary.

Direct upload isn't only about speed. Vercel caps a serverless request body at 4.5 MB — proxying a 5 MB photo through a route handler would just fail. It also keeps image bytes out of my functions and keeps function duration low.

**Doesn't that mean the client holds an upload permission?**

Briefly, yes, and that's the trade. So the signature is scoped tightly: a fixed folder, an allowed-format list, and everything that constrains the upload is part of the signed payload — anything left unsigned could be overridden by the client.

More importantly, the `public_id` that comes back is untrusted input. Someone could claim any id, including one belonging to a different complaint. So before I persist anything, the server independently re-reads the asset from Cloudinary's API and confirms it exists, is in my folder, is genuinely an image, and is within the size limit. *That's* the security boundary — the client-side checks are just fast feedback.

**What if someone has no Cloudinary account?**

`StorageProvider` is an interface with a local-disk implementation, selected automatically when credentials are absent. So the whole product runs and can be evaluated with zero third-party accounts. The local provider checks magic bytes rather than trusting the declared content type, and guards against path traversal. I'm clear in the README that it isn't production-viable on serverless — each instance has its own ephemeral filesystem, which is precisely why object storage exists.

---

## Email

**How does the notification work?**

Transactional outbox. Inside the same transaction as the status change, I update the complaint, append the audit event, and insert an `email_outbox` row marked `PENDING`. Then I commit. *Then* I attempt delivery.

**Why that order?**

Because a complaint update must not be reversible by a third-party outage. If I sent the email inside the transaction and it failed, I'd either roll back a legitimate status change or swallow the error and lie about it.

Committing the *intent* alongside the domain change means a notification can never be silently lost — if the process dies before dispatch, the row is still `PENDING` and can be retried.

**What happens if email fails?**

The complaint is still updated, the resident still sees the new status, and the outbox row records `FAILED` with the provider's reason. The API response says so honestly: `meta.notification.delivered` is false, and the UI shows a warning toast — *"Status updated. Notification could not be sent."* — rather than a success message that isn't quite true, or an error implying the update failed.

I also built an admin Email Log screen that reads the outbox. That makes delivery auditable rather than a black box, and it has a practical benefit: transactional providers restrict sending to unverified domains, so my seeded demo residents with fictional addresses won't receive real mail. The log still proves the pipeline ran correctly.

**Why one outbox row per recipient for a notice?**

So a single bad address fails alone and can be retried alone, instead of failing a batch of a hundred.

---

## Dashboard and performance

**How does the dashboard calculate its metrics?**

`GROUP BY` and `count(*) FILTER (WHERE …)` in Postgres. The headline numbers come from a single pass over the table producing seven figures at once, rather than seven separate `COUNT` queries. The independent aggregates are issued with `Promise.all`, so the page costs one round-trip of latency rather than the sum of seven.

The thing I'd flag: none of it is counted in JavaScript. Counting a page of results would silently report the page, not the dataset — that's the classic dashboard bug, and there's a test asserting the dashboard total equals the list total.

The 30-day trend uses `generate_series` left-joined against the data, so quiet days appear as zeros rather than being missing from the chart.

**How does pagination work?**

`LIMIT`/`OFFSET` with a separate `COUNT` for the total, both in SQL. Page size is capped at 100 so a client can't request the whole table.

I'd move to keyset pagination if this grew — `OFFSET 10000` makes Postgres scan and discard 10,000 rows. At this scale it's the wrong optimisation to make early, and offset pagination lets you jump to an arbitrary page, which keyset doesn't.

**Why did you write the charts by hand?**

Three charts is about 400 lines of SVG. Writing them directly means the marks use my own colour tokens, so both themes are correct automatically rather than needing a second theme config for the chart library. There's no recognisable library default look. And the bundle carries no extra dependency.

Each chart also renders a visually-hidden data table, so the numbers reach a screen reader instead of being locked inside a picture.

---

## Scale and production

**How would this scale to 100,000 residents?**

Different parts break at different points, so let me take them in order.

*First to break* is the important-notice fan-out. Today it's one outbox row per active resident inserted in the transaction — at 100k residents that's a 100k-row insert holding a transaction open. I'd change it to insert a single "broadcast" row and have a worker expand it in batches.

*Second* is offset pagination, as above — keyset by `(created_at, id)`.

*Third* is search. Trigram `ILIKE` is fine at this scale; past roughly a million complaints I'd add a `tsvector` column with a GIN index and ranked results.

*Fourth* is the rate limiter, which is in-memory and therefore per-instance. That needs a shared counter — Upstash or Vercel KV — and it's a drop-in replacement for one function.

What *doesn't* break: the overdue query is a partial index scan and stays that way; the session lookup is a single unique-index hit; the dashboard aggregates would need a materialised view refreshed periodically, but only well past 100k.

**What would you change for production?**

Distributed rate limiting. A background worker for email retries. Real observability — structured logs with the request id I already generate, plus error tracking. Database backups and a tested restore. And I'd want the audit trail on a retention policy, because it grows forever by design.

**What are the biggest security risks in this system?**

Honestly? The upload signature, because it's the one place a client holds a credential, even briefly. I mitigated it by scoping the signature and re-verifying server-side, but it's the surface I'd have someone else review first.

After that, the in-memory rate limiter — it raises the cost of credential stuffing rather than capping it, and I'd rather say that plainly than imply it's a complete defence.

Third would be that admins are all-powerful. There's no audit of admin actions *outside* complaints — a rogue admin could change the overdue threshold to 365 and hide the entire queue. I'd add an admin action log and probably a second role tier.

**What would you improve with more time?**

Assignment to named staff or vendors, so complaints have an owner and not just a status. A resident-visible comment thread, separate from the audit trail — right now the only way to communicate is a note attached to a status change. CSV export for AGM reporting. And a screen-reader pass with VoiceOver, which I've implemented for but not verified.

---

## Questions worth being ready for

**"Why is `RESOLVED` terminal? What if the issue comes back?"**
The brief specifies it, and I think it's right. Reopening would make "time to resolve" meaningless and let a single record accumulate an unbounded history. A recurrence is a new complaint with its own reference and its own trail — and it makes recurring problems *visible*, which is exactly what the brief says the committee currently lacks.

**"Your complaint list joins to users on every query. Isn't that wasteful?"**
It's an indexed join on a primary key, and I need the resident's name and flat number in the row. The alternative — denormalising the name onto the complaint — would go stale when someone updates their profile.

**"You cache settings for 30 seconds. Isn't that a correctness problem?"**
It's a deliberate trade. Settings are read by nearly every complaint query and change perhaps monthly. The window means a threshold change can take up to 30 seconds to appear — worth it to avoid a round-trip on every list and dashboard load. The cache is invalidated on write, so in a single-instance deployment it's immediate anyway.

**"What's the weakest part of this codebase?"**
The `complaint.service.ts` file is getting long — around 600 lines. If I added assignment or comments I'd split the read and write paths. (I found and fixed a related one during review: `serializeComplaint` was restating the allowed-transition logic instead of reading `STATUS_TRANSITIONS` — exactly the kind of duplication that lets a UI offer a button the API rejects.)
