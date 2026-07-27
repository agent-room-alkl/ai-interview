-- Dedicated schema so we share the agent-room Postgres without colliding on public.*
CREATE SCHEMA IF NOT EXISTS ai_interview;

CREATE TABLE IF NOT EXISTS ai_interview."User" (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    name TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_interview."Interview" (
    id TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "resumeText" TEXT NOT NULL,
    "resumeFileUrl" TEXT,
    "targetRole" TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interview_userId_fkey" FOREIGN KEY ("userId") REFERENCES ai_interview."User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_interview."Turn" (
    id TEXT PRIMARY KEY,
    "interviewId" TEXT NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Turn_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES ai_interview."Interview"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
