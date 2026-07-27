// T-09: Report results page (server guard).
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ReportView from "./ReportView";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) redirect("/dashboard");

  return (
    <ReportView
      interviewId={id}
      candidateName={interview.candidateName}
      targetRole={interview.targetRole ?? "the role"}
      mode={interview.mode}
    />
  );
}
