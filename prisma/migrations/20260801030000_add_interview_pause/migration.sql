ALTER TABLE ai_interview."Interview"
  ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pausedRemainingSeconds" INTEGER;
