ALTER TABLE ai_interview."Interview"
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 10;
