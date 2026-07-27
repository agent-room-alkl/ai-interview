// T-05: Role-selection page (server component). Guards ownership, renders selector.
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import RoleSelector from "./RoleSelector";

export default async function RolesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const interview = await prisma.interview.findUnique({ where: { id } });
  if (!interview || interview.userId !== session.user.id) redirect("/dashboard");

  return <RoleSelector interviewId={id} />;
}
