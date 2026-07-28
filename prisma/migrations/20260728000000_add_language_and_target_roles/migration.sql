-- T-05: interview language detected from résumé (BCP-47 primary subtag).
-- T-06: multi-role support — one or more roles the candidate interviews for.
-- Both are additive with safe defaults so existing rows migrate cleanly.
ALTER TABLE ai_interview."Interview" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE ai_interview."Interview" ADD COLUMN IF NOT EXISTS "targetRoles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill targetRoles from the existing single targetRole for older interviews.
UPDATE ai_interview."Interview"
  SET "targetRoles" = ARRAY["targetRole"]
  WHERE "targetRole" IS NOT NULL
    AND ("targetRoles" IS NULL OR cardinality("targetRoles") = 0);
