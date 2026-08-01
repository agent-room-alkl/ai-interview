import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  ReportSchema,
  scoreInterview,
  type InterviewReport,
} from "@/lib/report";

type ReportableInterview = {
  id: string;
  candidateName: string;
  targetRole: string | null;
  mode: string;
  turns: { speaker: string; text: string }[];
};

const WAIT_ATTEMPTS = 120;
const WAIT_MS = 500;

function parseReport(json: string): InterviewReport | null {
  try {
    const parsed = ReportSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Claim a unique cache row before calling the model. Concurrent requests wait
 * for the owner instead of scoring the same interview more than once.
 */
export async function getOrCreateInterviewReport(
  interview: ReportableInterview,
  force = false,
): Promise<InterviewReport> {
  if (force) {
    await prisma.interviewReportCache.deleteMany({
      where: { interviewId: interview.id },
    });
  }

  const cached = await prisma.interviewReportCache.findUnique({
    where: { interviewId: interview.id },
  });
  if (cached?.json) {
    const report = parseReport(cached.json);
    if (report) return report;
    await prisma.interviewReportCache.delete({ where: { id: cached.id } });
  }

  let ownsClaim = false;
  try {
    await prisma.interviewReportCache.create({
      data: { interviewId: interview.id },
    });
    ownsClaim = true;
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error;
    }
  }

  if (!ownsClaim) {
    for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_MS));
      const pending = await prisma.interviewReportCache.findUnique({
        where: { interviewId: interview.id },
      });
      if (!pending) {
        return getOrCreateInterviewReport(interview, false);
      }
      if (pending.json) {
        const report = parseReport(pending.json);
        if (report) return report;
        await prisma.interviewReportCache.delete({ where: { id: pending.id } });
        return getOrCreateInterviewReport(interview, false);
      }
    }
    throw new Error("report_generation_timeout");
  }

  try {
    const report = await scoreInterview(
      interview.turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
      })),
      {
        candidateName: interview.candidateName,
        targetRole: interview.targetRole ?? "the role",
        mode: interview.mode as "practice" | "interview",
      },
    );
    await prisma.$transaction([
      prisma.interviewReportCache.update({
        where: { interviewId: interview.id },
        data: { json: JSON.stringify(report) },
      }),
      prisma.interview.update({
        where: { id: interview.id },
        data: { status: "completed" },
      }),
    ]);
    return report;
  } catch (error) {
    await prisma.interviewReportCache.deleteMany({
      where: { interviewId: interview.id, json: null },
    });
    throw error;
  }
}
