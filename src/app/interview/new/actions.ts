"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseResumeFile, standardizeResumeText } from "@/lib/resume-parse";

export type CreateInterviewState = {
  error?: string;
  resumePreview?: string;
};

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
  const file = formData.get("resumeFile");

  if (!candidateName) {
    return { error: "Candidate name is required." };
  }

  if (modeRaw !== "practice" && modeRaw !== "interview") {
    return { error: "Choose Practice or Interview mode." };
  }

  let resumeText = pasted;
  let resumeFileUrl: string | null = null;

  // The first file submission returns a sanitized, compact preview so the
  // candidate can review/edit it before an interview record is created.
  if (!pasted && file instanceof File && file.size > 0) {
    const parsed = await parseResumeFile(file);
    if (parsed.error) return { error: parsed.error };
    resumeText = standardizeResumeText(parsed.text);
    if (!resumeText) {
      return { error: "Could not find usable résumé content after removing contact details." };
    }
    return { resumePreview: resumeText };
  }

  if (resumeText) {
    resumeText = standardizeResumeText(resumeText);
    if (!resumeText) {
      return { error: "Please provide résumé content other than contact details." };
    }
    if (file instanceof File && file.size > 0) {
      resumeFileUrl = file.name;
    }
  } else if (file instanceof File && file.size > 0) {
    // Defensive fallback for unusual multipart submissions.
    const parsed = await parseResumeFile(file);
    if (parsed.error) return { error: parsed.error };
    resumeText = standardizeResumeText(parsed.text);
    resumeFileUrl = file.name;
  }

  if (!resumeText) {
    return {
      error: "Provide a résumé — upload a PDF, HTML, DOCX, or TXT file, or paste the text.",
    };
  }

  const interview = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: { resumeContext: resumeText },
    });
    return tx.interview.create({
      data: {
        userId: session.user.id,
        candidateName,
        resumeText,
        resumeFileUrl,
        mode: modeRaw,
        status: "draft",
      },
    });
  });

  redirect(`/interview/${interview.id}/roles`);
}
