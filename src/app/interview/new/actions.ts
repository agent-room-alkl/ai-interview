"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PAID_DURATIONS } from "@/lib/billing";
import { withPracticeAccess } from "@/lib/practice-access";
import { parseResumeFile, standardizeResumeText } from "@/lib/resume-parse";

export type CreateInterviewState = { error?: string; resumePreview?: string };

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
  const durationMinutes = (PAID_DURATIONS as readonly number[]).includes(durationRaw)
    ? durationRaw
    : 20;

  let resumeText = pasted;
  let resumeFileUrl: string | null = null;

  if (!pasted && file instanceof File && file.size > 0) {
    const parsed = await parseResumeFile(file);
    if (parsed.error) return { error: parsed.error };
    resumeText = standardizeResumeText(parsed.text);
    if (!resumeText) return { error: "Could not find usable résumé content after removing contact details." };
    return { resumePreview: resumeText };
  }

  if (resumeText) {
    resumeText = standardizeResumeText(resumeText);
    if (!resumeText) return { error: "Please provide résumé content other than contact details." };
    if (file instanceof File && file.size > 0) resumeFileUrl = file.name;
  }

  if (!resumeText) {
    return {
      error: "Provide a résumé — upload a PDF, HTML, DOCX, or TXT file, or paste the text.",
    };
  }

  const result = await withPracticeAccess(session.user.id, durationMinutes, async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: {
        resumeContext: resumeText,
      },
    });
    return tx.interview.create({
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
  });

  if (!result.ok) return { error: result.reason };
  redirect(`/interview/${result.value.id}/roles`);
}
