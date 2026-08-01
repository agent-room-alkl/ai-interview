import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "@/components/Logo";
import { PurchaseHistory } from "@/components/PurchaseHistory";
import { hasActiveAccess } from "@/lib/billing";

type StoredReport = { overallScore?: number };

function readScore(text: string | undefined): number | null {
  if (!text) return null;
  try {
    const value = (JSON.parse(text) as StoredReport).overallScore;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [profile, interviews, purchases] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { resumeContext: true, accessUntil: true, trialUsed: true },
    }),
    prisma.interview.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        turns: {
          select: { speaker: true, text: true },
        },
      },
    }),
    prisma.purchase.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        pack: true,
        days: true,
        amountCents: true,
        status: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ]);

  const scored = interviews
    .map((interview) => ({
      ...interview,
      score: readScore(
        interview.turns.find((turn) => turn.speaker === "report")?.text,
      ),
    }))
    .filter((interview) => interview.score !== null);
  const scores = scored.map((interview) => interview.score as number);
  const average = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : null;
  const best = scores.length ? Math.max(...scores) : null;
  const oldest = scored.at(-1)?.score ?? null;
  const latest = scored[0]?.score ?? null;
  const progress = oldest !== null && latest !== null ? latest - oldest : null;
  const answerCount = interviews.reduce(
    (total, interview) =>
      total + interview.turns.filter((turn) => turn.speaker === "user").length,
    0,
  );
  const completedCount = interviews.filter(
    (interview) =>
      interview.status === "completed" ||
      interview.turns.some((turn) => turn.speaker === "report"),
  ).length;
  const accessActive = hasActiveAccess(profile?.accessUntil);
  const accessLabel = accessActive && profile?.accessUntil
    ? `Active until ${new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(profile.accessUntil)}`
    : profile?.trialUsed
      ? "Trial used — buy a pack to continue"
      : "Free 10-min trial available";

  return (
    <main className="min-h-dvh bg-[#f6f5f0] text-[#17201e]">
      <div className="safe-px mx-auto max-w-7xl px-4 py-8 sm:px-10 sm:py-10 lg:px-16">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link href="/" className="inline-flex"><Logo /></Link>
            <p className="text-sm text-[#65736d]">Your progress</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.07em] sm:text-5xl">
              Hi, {session.user.name ?? "there"}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#65736d]">
              See how your interview practice is building over time.
            </p>
          </div>
          <UserButton />
        </header>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Practice sessions", String(interviews.length), "Started"],
            ["Completed", String(completedCount), "Finished sessions"],
            ["Average score", average === null ? "—" : `${average}`, "Overall score"],
            ["Best score", best === null ? "—" : `${best}`, "Personal best"],
          ].map(([label, value, detail]) => (
            <article key={label} className="rounded-2xl border border-[#17201e]/10 bg-white/55 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">{label}</p>
              <p className="mt-4 text-4xl font-semibold tracking-[-0.06em]">{value}</p>
              <p className="mt-2 text-xs text-[#65736d]">{detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <article className="rounded-3xl bg-[#17201e] p-6 text-[#f6f5f0] sm:p-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <p className="text-sm text-[#a9bbb2]">Keep the momentum</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
                  Start a tailored interview.
                </h2>
              </div>
              <Link
                href="/interview/new"
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#d7f16a] px-5 py-3 text-sm font-semibold text-[#17201e]"
              >
                New interview ↗
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-5 text-sm text-[#c2d0c9]">
              <span><strong className="text-[#f6f5f0]">{answerCount}</strong> answers practiced</span>
              {progress !== null ? (
                <span>
                  <strong className={progress >= 0 ? "text-[#d7f16a]" : "text-[#f4a38a]"}>
                    {progress >= 0 ? "+" : ""}{progress} pts
                  </strong>{" "}since your first scored session
                </span>
              ) : (
                <span>Complete a session to see your progress trend</span>
              )}
            </div>
          </article>

          <div className="grid gap-6">
            <article className="rounded-3xl border border-[#17201e]/10 bg-white/55 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">Practice access</p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em]">
                {accessActive ? "Unlocked" : "Limited"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#65736d]">{accessLabel}</p>
              <Link href="/pricing" className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4">
                {accessActive ? "Stack more time →" : "View pricing →"}
              </Link>
            </article>
            <article className="rounded-3xl border border-[#17201e]/10 bg-white/55 p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">Résumé background</p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em]">
                {profile?.resumeContext ? "Ready to reuse" : "Not added yet"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#65736d]">
                {profile?.resumeContext
                  ? "Your privacy-filtered background will load automatically for your next interview."
                  : "Add a résumé once and reuse the cleaned background in future sessions."}
              </p>
              <Link href="/interview/new" className="mt-5 inline-flex text-sm font-semibold underline underline-offset-4">
                {profile?.resumeContext ? "Review résumé background →" : "Add résumé →"}
              </Link>
            </article>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-[#17201e]/10 bg-white/55 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">Score trend</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Your recent scored sessions</h2>
            </div>
            {progress !== null ? <p className="text-sm text-[#65736d]">{progress >= 0 ? "Moving in the right direction" : "Keep practicing the weak spots"}</p> : null}
          </div>
          {scored.length ? (
            <div className="mt-6 flex h-40 items-end gap-2 border-b border-[#17201e]/10 pb-0 sm:gap-3">
              {scored
                .slice(0, 8)
                .reverse()
                .map((item) => (
                  <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold">{item.score}</span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t-lg bg-[#e57b4f]"
                        style={{ height: `${Math.max(8, item.score ?? 0)}%` }}
                        title={`${item.score}/100`}
                      />
                    </div>
                    <span className="max-w-full truncate text-[10px] text-[#65736d]">{item.targetRole ?? "Session"}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-[#17201e]/15 px-4 py-8 text-center text-sm text-[#65736d]">
              Your score trend will appear here after you finish your first interview.
            </div>
          )}
        </section>

        <section className="mt-6 rounded-3xl border border-[#17201e]/10 bg-white/55 p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">Billing</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Purchase history</h2>
          <PurchaseHistory
            purchases={purchases.map((p) => ({
              id: p.id,
              pack: p.pack,
              days: p.days,
              amountCents: p.amountCents,
              status: p.status,
              paidAt: p.paidAt?.toISOString() ?? null,
              createdAt: p.createdAt.toISOString(),
            }))}
          />
        </section>

        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#65736d]">History</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]">Recent practice</h2>
            </div>
          </div>
          <div className="mt-4 divide-y divide-[#17201e]/10 rounded-2xl border border-[#17201e]/10 bg-white/55">
            {interviews.slice(0, 6).map((interview) => {
              const score = readScore(interview.turns.find((turn) => turn.speaker === "report")?.text);
              const timedOut =
                !!interview.deadlineAt &&
                interview.deadlineAt.getTime() <= Date.now() &&
                interview.status !== "completed" &&
                score === null;
              const completed =
                interview.status === "completed" || score !== null || timedOut;
              const href = completed
                ? `/interview/${interview.id}/report`
                : interview.targetRole
                  ? `/interview/${interview.id}/room`
                  : `/interview/${interview.id}/roles`;
              const statusLabel =
                score !== null
                  ? `${score}/100`
                  : completed
                    ? "Completed"
                    : "In progress";
              const cta = completed ? "View report →" : "View details →";
              return (
                <Link
                  key={interview.id}
                  href={href}
                  className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-white/70 sm:px-5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{interview.targetRole ?? "Role selection in progress"}</span>
                    <span className="mt-1 block text-xs text-[#65736d]">{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(interview.createdAt)} · {interview.mode === "practice" ? "Practice" : "Interview"}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-lg font-semibold">{statusLabel}</span>
                    <span className="text-xs text-[#65736d]">{cta}</span>
                  </span>
                </Link>
              );
            })}
            {!interviews.length ? <p className="px-5 py-8 text-sm text-[#65736d]">No practice sessions yet.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
