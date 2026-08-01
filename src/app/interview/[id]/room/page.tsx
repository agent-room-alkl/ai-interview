// T-07: Interview room page (server guard). Loads interview + transcript.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import InterviewRoom from "./InterviewRoom";
import PausedInterview from "./PausedInterview";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  let interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview || interview.userId !== session.user.id) redirect("/dashboard");
  if (!interview.targetRole) redirect(`/interview/${id}/roles`);
  if (interview.status === "completed") redirect(`/interview/${id}/report`);
  if (interview.pausedAt) {
    return <PausedInterview interviewId={id} remainingSeconds={interview.pausedRemainingSeconds ?? 0} />;
  }

  // Start the selected timer window exactly once on the server so refresh does
  // not reset countdown (practice soft timer + formal hard stop share startedAt).
  // Concurrent room loads are safe: only the request that still sees null wins.
  if (!interview.deadlineAt && !interview.pausedAt) {
    const startedAt = new Date();
    const deadlineAt = new Date(
      startedAt.getTime() + interview.durationMinutes * 60 * 1000,
    );
    await prisma.interview.updateMany({
      where: { id, userId: session.user.id, deadlineAt: null },
      data: {
        startedAt,
        deadlineAt,
        status: interview.status === "completed" ? "completed" : "in_progress",
      },
    });
    interview = await prisma.interview.findUnique({
      where: { id },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });
    if (!interview) redirect("/dashboard");
  }
  // Countdown hit zero (practice soft timer or formal hard stop) → report only.
  if (interview.deadlineAt && interview.deadlineAt.getTime() <= Date.now()) {
    if (interview.status !== "completed") {
      await prisma.interview.update({
        where: { id },
        data: { status: "completed" },
      });
    }
    redirect(`/interview/${id}/report`);
  }

  const initialTurns = interview.turns
    .filter((t) => ["interviewer", "trainer", "user"].includes(t.speaker))
    .map((t) => ({ speaker: t.speaker as "interviewer" | "trainer" | "user", text: t.text }));

  return (
    <InterviewRoom
      interviewId={id}
      mode={interview.mode as "practice" | "interview"}
      language={interview.language}
      targetRole={interview.targetRole!}
      durationMinutes={interview.durationMinutes}
      // Practice gets a soft client countdown; only formal interviews hard-stop.
      deadlineAt={interview.deadlineAt?.toISOString() ?? null}
      initialTurns={initialTurns}
    />
  );
}
