-- Change screening id to BIGINT and drop unique constraint
-- (delete-and-reinsert handles deduplication now)

ALTER TABLE screening ALTER COLUMN id TYPE BIGINT;

DROP INDEX IF EXISTS idx_screening_unique;
