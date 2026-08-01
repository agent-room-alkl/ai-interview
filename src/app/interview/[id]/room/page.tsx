// T-07: Interview room page (server guard). Loads interview + transcript.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import InterviewRoom from "./InterviewRoom";

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

  // Start the selected formal-interview window exactly once on the server.
  // concurrent room loads safe: only the request that still sees null wins.
  if (interview.mode === "interview" && !interview.deadlineAt) {
    const startedAt = new Date();
    const deadlineAt = new Date(
      startedAt.getTime() + interview.durationMinutes * 60 * 1000,
    );
    await prisma.interview.updateMany({
      where: { id, userId: session.user.id, deadlineAt: null },
      data: { startedAt, deadlineAt, status: "in_progress" },
    });
    interview = await prisma.interview.findUnique({
      where: { id },
      include: { turns: { orderBy: { createdAt: "asc" } } },
    });
    if (!interview) redirect("/dashboard");
  }
  if (
    interview.mode === "interview" &&
    interview.deadlineAt &&
    interview.deadlineAt.getTime() <= Date.now()
  ) {
    await prisma.interview.update({
      where: { id },
      data: { status: "completed" },
    });
    redirect(`/interview/${id}/report`);
  }

  const initialTurns = interview.turns
    .filter((t) => ["interviewer", "trainer", "user"].includes(t.speaker))
    .map((t) => ({ speaker: t.speaker as "interviewer" | "trainer" | "user", text: t.text }));

  return (
    <InterviewRoom
      interviewId={id}
      mode={interview.mode as "practice" | "interview"}
      targetRole={interview.targetRole!}
      durationMinutes={interview.durationMinutes}
      // Practice gets a soft client countdown; only formal interviews hard-stop.
      deadlineAt={
        interview.deadlineAt?.toISOString() ??
        (interview.mode === "practice"
          ? new Date(Date.now() + interview.durationMinutes * 60 * 1000).toISOString()
          : null)
      }
      initialTurns={initialTurns}
    />
  );
}
