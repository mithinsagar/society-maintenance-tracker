-- ============================================================================
-- Complaint reference numbering.
--
-- This runs before the tables are created, because `complaints.reference`
-- declares a column DEFAULT that draws from this sequence — and Postgres
-- resolves a DEFAULT expression at DDL time, so the sequence must already
-- exist.
--
-- Why a sequence rather than an application counter: reference allocation must
-- be atomic. `SELECT max(reference) + 1` would race under concurrent inserts,
-- and serialising it would mean locking the whole table on every complaint.
-- `nextval()` is atomic by construction and never blocks.
--
-- Gaps are expected and acceptable: a rolled-back transaction consumes its
-- number. A reference is an identifier, not an audited count.
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS complaint_reference_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  NO MAXVALUE
  CACHE 1;
