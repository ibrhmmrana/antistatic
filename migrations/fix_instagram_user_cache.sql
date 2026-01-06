-- Migration: Fix instagram_user_cache table
-- 
-- 1. Delete cache rows where ig_account_id IS NULL (it's a cache, not critical data)
-- 2. Add unique index on (ig_account_id, ig_user_id) to prevent cross-account overwrites
--
-- Run this migration before doing a clean resync

BEGIN;

-- Step 1: Delete cache rows where ig_account_id IS NULL
-- These are invalid cache entries that cannot be properly scoped
DELETE FROM instagram_user_cache
WHERE ig_account_id IS NULL;

-- Log how many rows were deleted
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % cache rows with NULL ig_account_id', deleted_count;
END $$;

-- Step 2: Add unique index on (ig_account_id, ig_user_id)
-- This ensures that cache entries are scoped per account and prevents overwrites
-- If the index already exists, this will fail gracefully (you can drop it first if needed)
CREATE UNIQUE INDEX IF NOT EXISTS instagram_user_cache_ig_account_id_ig_user_id_unique
ON instagram_user_cache(ig_account_id, ig_user_id);

-- Step 3: Ensure ig_account_id is NOT NULL going forward
-- Add a constraint to prevent future NULL values
ALTER TABLE instagram_user_cache
ALTER COLUMN ig_account_id SET NOT NULL;

COMMIT;

-- Verification queries (run these after migration to verify):
-- 
-- SELECT COUNT(*) as total_rows FROM instagram_user_cache;
-- SELECT COUNT(*) as null_ig_account_id FROM instagram_user_cache WHERE ig_account_id IS NULL;
-- SELECT COUNT(*) as unique_pairs FROM (SELECT DISTINCT ig_account_id, ig_user_id FROM instagram_user_cache) t;
-- 
-- Expected results:
-- - null_ig_account_id should be 0
-- - unique_pairs should equal total_rows (if the unique index is working)

