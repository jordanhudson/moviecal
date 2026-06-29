-- Store screening times as real instants (timestamptz, UTC under the hood)
-- instead of naive timestamps that represent Pacific wall-clock by convention.
--
-- Existing values are Pacific wall-clock with no offset attached, so we
-- reinterpret each one through the America/Vancouver zone: `AT TIME ZONE`
-- applies the offset that was actually in effect at that local time (PDT vs
-- PST), yielding the correct absolute instant per row. From here on, scrapers
-- emit real instants and the display layer converts back to Pacific.
--
-- Guarded so a bootstrap re-apply on an older DB is a no-op once converted.

DO $$
BEGIN
  IF (
    SELECT data_type
    FROM information_schema.columns
    WHERE table_name = 'screening' AND column_name = 'datetime'
  ) = 'timestamp without time zone' THEN
    ALTER TABLE screening
      ALTER COLUMN datetime TYPE timestamptz
      USING datetime AT TIME ZONE 'America/Vancouver';
  END IF;
END $$;
