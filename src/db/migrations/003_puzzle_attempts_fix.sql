-- Chess IQ Migration 003: Fix puzzle_attempts table
-- Removes FK constraint and widens puzzle_id to support blunder puzzle IDs (e.g. "uuid-moveNum")

-- Drop the old FK constraint (name may vary; use IF EXISTS pattern via DO block)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'puzzle_attempts'::regclass
    AND contype = 'f'
    AND conname LIKE '%puzzle_id%'
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE puzzle_attempts DROP CONSTRAINT %I', con_name);
    RAISE NOTICE 'Dropped FK constraint: %', con_name;
  ELSE
    RAISE NOTICE 'No FK constraint on puzzle_attempts.puzzle_id found, skipping';
  END IF;
END $$;

-- Widen the column from VARCHAR(10) to VARCHAR(50)
ALTER TABLE puzzle_attempts
  ALTER COLUMN puzzle_id TYPE VARCHAR(50);
