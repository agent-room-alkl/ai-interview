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
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: { turns: { orderBy: { createdAt: "asc" } } },
  });
  if (!interview || interview.userId !== session.user.id) redirect("/dashboard");
  if (!interview.targetRole) redirect(`/interview/${id}/roles`);

  const initialTurns = interview.turns
    .filter((t) => ["interviewer", "trainer", "user"].includes(t.speaker))
    .map((t) => ({ speaker: t.speaker as "interviewer" | "trainer" | "user", text: t.text }));

  return (
    <InterviewRoom
      interviewId={id}
      mode={interview.mode as "practice" | "interview"}
      candidateName={interview.candidateName}
      candidateImageUrl={session.user.imageUrl}
      targetRole={interview.targetRole}
      language={interview.language}
      initialTurns={initialTurns}
    />
  );
}
