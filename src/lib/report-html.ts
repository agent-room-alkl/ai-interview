// T-09: Render an InterviewReport to a standalone, self-contained HTML document.
import type { InterviewReport } from "@/lib/report";

export function renderReportHtml(
  report: InterviewReport,
  meta: { candidateName: string; targetRole: string; mode: string; date: string },
): string {
  const bar = (score: number) => {
    const hue = score >= 75 ? 145 : score >= 50 ? 45 : 5;
    return `<div style="background:#eee;border-radius:6px;height:10px;overflow:hidden">
      <div style="width:${score}%;height:100%;background:hsl(${hue} 70% 45%)"></div></div>`;
  };
  const dims = report.dimensions
    .map(
      (d) => `<div class="dim">
        <div class="dim-head"><span>${escapeHtml(d.name)}</span><b>${d.score}</b></div>
        ${bar(d.score)}
        <p>${escapeHtml(d.feedback)}</p>
      </div>`,
    )
    .join("");
  const li = (items: string[]) =>
    items.map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Interview Report — ${escapeHtml(meta.candidateName)}</title>
<style>
  *{box-sizing:border-box} body{font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#17201e;max-width:820px;margin:0 auto;padding:40px 24px;background:#fff}
  h1{font-size:28px;margin:0 0 4px} .muted{color:#65736d} .score-big{font-size:64px;font-weight:700;line-height:1}
  .card{border:1px solid #e5e7eb;border-radius:14px;padding:20px;margin:18px 0}
  .dim{margin:14px 0} .dim-head{display:flex;justify-content:space-between;font-weight:600;margin-bottom:6px}
  .dim p{margin:6px 0 0;color:#444;font-size:14px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:18px} ul{margin:6px 0 0;padding-left:18px}
  .header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border-bottom:2px solid #17201e;padding-bottom:16px}
  @media print{body{padding:0}}
</style></head><body>
  <div class="header">
    <div><h1>Interview Report</h1>
      <div class="muted">${escapeHtml(meta.candidateName)} · ${escapeHtml(meta.targetRole)} · ${escapeHtml(meta.mode)} · ${escapeHtml(meta.date)}</div>
    </div>
    <div style="text-align:right"><div class="muted">Overall</div><div class="score-big">${report.overallScore}</div></div>
  </div>
  <div class="card"><b>Summary</b><p>${escapeHtml(report.summary)}</p></div>
  <div class="card"><b>Dimensions</b>${dims}</div>
  <div class="cols">
    <div class="card"><b>Strengths</b><ul>${li(report.strengths)}</ul></div>
    <div class="card"><b>Areas to improve</b><ul>${li(report.improvements)}</ul></div>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
