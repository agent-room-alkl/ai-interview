"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseResumeFile } from "@/lib/resume-parse";

export type CreateInterviewState = { error?: string };

export async function createInterview(
  _prev: CreateInterviewState,
  formData: FormData,
): Promise<CreateInterviewState> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const candidateName = String(formData.get("candidateName") ?? "").trim();
  const pasted = String(formData.get("resumeText") ?? "").trim();
  const modeRaw = String(formData.get("mode") ?? "").trim();
  const durationRaw = Number(formData.get("durationMinutes") ?? 20);
  const file = formData.get("resumeFile");

  if (!candidateName) {
    return { error: "Candidate name is required." };
  }

  if (modeRaw !== "practice" && modeRaw !== "interview") {
    return { error: "Choose Practice or Interview mode." };
  }
  const durationMinutes = [10, 20, 30].includes(durationRaw) ? durationRaw : 20;

  let resumeText = pasted;
  let resumeFileUrl: string | null = null;

  if (file instanceof File && file.size > 0) {
    const parsed = await parseResumeFile(file);
    if (parsed.error) return { error: parsed.error };
    resumeText = parsed.text;
    resumeFileUrl = file.name;
  }

  if (!resumeText) {
    return {
      error: "Provide a résumé — upload a PDF/DOCX or paste the text.",
    };
  }

  const interview = await prisma.interview.create({
    data: {
      userId: session.user.id,
      candidateName,
      resumeText,
      resumeFileUrl,
      mode: modeRaw,
      durationMinutes,
      status: "draft",
    },
  });

  redirect(`/interview/${interview.id}/roles`);
}
