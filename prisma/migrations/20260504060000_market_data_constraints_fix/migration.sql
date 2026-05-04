-- Ensure named constraints exist on market_books so ON CONFLICT works reliably.
-- The original migration used an inline UNIQUE which may not have been applied
-- if the table already existed without the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'market_books'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'market_books_source_book_uniq'
  ) THEN
    ALTER TABLE market_books
      ADD CONSTRAINT market_books_source_book_uniq UNIQUE (source, source_book_id);
  END IF;
END $$;
