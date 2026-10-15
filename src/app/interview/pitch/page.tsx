import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PitchPractice from "./PitchPractice";

export default async function PitchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { resumeContext: true },
  });
  return <PitchPractice initialResumeText={profile?.resumeContext ?? ""} />;
}
