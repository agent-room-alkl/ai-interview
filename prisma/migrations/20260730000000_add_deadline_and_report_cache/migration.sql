ALTER TABLE ai_interview."Interview"
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deadlineAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS ai_interview."InterviewReportCache" (
    id TEXT PRIMARY KEY,
    "interviewId" TEXT NOT NULL UNIQUE,
    json TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InterviewReportCache_interviewId_fkey"
      FOREIGN KEY ("interviewId") REFERENCES ai_interview."Interview"(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);
