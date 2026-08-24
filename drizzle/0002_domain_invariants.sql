-- ============================================================================
-- Domain invariants enforced in the database, not merely in application code.
--
-- Application-layer rules are only as strong as the code path that happens to
-- be taken. Everything in this migration holds even against a stray psql
-- session, a future refactor, or a bug in the service layer.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Reference format.
--
-- The sequence-backed DEFAULT (migrations 0000/0001) produces the format, but
-- a DEFAULT only applies when no value is supplied. This CHECK makes the shape
-- a guarantee even if a caller passes `reference` explicitly.
-- ----------------------------------------------------------------------------

ALTER TABLE "complaints"
  ADD CONSTRAINT "complaints_reference_format_check"
  CHECK ("reference" ~ '^CMP-[0-9]{6,}$');


-- ----------------------------------------------------------------------------
-- 2. The audit trail is append-only.
--
-- This is the backbone of the complaint history requirement. The service layer
-- exposes no update or delete path for complaint_events, but "we didn't write
-- the code" is not an integrity guarantee — this trigger is.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_complaint_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'complaint_events is append-only: % is not permitted on this table', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Correct a mistaken entry by appending a new event, never by rewriting history.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER complaint_events_no_update
  BEFORE UPDATE ON "complaint_events"
  FOR EACH ROW EXECUTE FUNCTION reject_complaint_event_mutation();

CREATE TRIGGER complaint_events_no_delete
  BEFORE DELETE ON "complaint_events"
  FOR EACH ROW EXECUTE FUNCTION reject_complaint_event_mutation();

-- Note on the ON DELETE CASCADE from complaints: a row-level BEFORE DELETE
-- trigger would also block cascaded deletes, which is intentional. There is no
-- complaint-delete endpoint; purging a complaint is a deliberate operational
-- act that must disable this trigger explicitly, which is exactly the friction
-- an audit trail should have.


-- ----------------------------------------------------------------------------
-- 3. `updated_at` is maintained by the database.
--
-- Keeping this in Postgres means every write path is covered — including
-- migrations, admin SQL, and any future service that talks to this database.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER complaints_set_updated_at
  BEFORE UPDATE ON "complaints"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER notices_set_updated_at
  BEFORE UPDATE ON "notices"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER app_settings_set_updated_at
  BEFORE UPDATE ON "app_settings"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ----------------------------------------------------------------------------
-- 4. Complaint search.
--
-- Admin search is a substring match over reference, title and description.
-- A trigram GIN index turns the resulting ILIKE '%term%' — which cannot use a
-- B-tree — into an index scan. This is the right tool at this scale; the point
-- at which it should become a tsvector column with a full-text index is
-- documented in the README under "Future improvements".
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "complaints_search_trgm_idx"
  ON "complaints"
  USING GIN ((coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || "reference") gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- 5. Partial index for the overdue queue.
--
-- The overdue predicate only ever touches non-resolved complaints. A partial
-- index covers exactly those rows, so it stays small as the resolved archive
-- grows — which is the majority of the table over time.
-- ----------------------------------------------------------------------------

CREATE INDEX "complaints_unresolved_created_idx"
  ON "complaints" ("created_at")
  WHERE "status" <> 'RESOLVED';


-- ----------------------------------------------------------------------------
-- 6. Settings singleton.
--
-- The CHECK (id = 1) constraint makes a second row impossible; this seeds the
-- one row that must exist so the application never has to handle its absence.
-- ----------------------------------------------------------------------------

INSERT INTO "app_settings" ("id", "society_name", "overdue_threshold_days")
VALUES (1, 'Greenwood Heights', 7)
ON CONFLICT ("id") DO NOTHING;
