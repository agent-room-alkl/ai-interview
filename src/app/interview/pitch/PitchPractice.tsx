"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/LanguageProvider";
import { PITCH_LANGUAGES, type PitchLanguage, type PitchLanguageChoice } from "@/lib/pitch-coaching";

type Feedback = { language: PitchLanguage; score: number; feedback: string; improvedPitch: string; templateOutline: string[]; personalizationNotes: string; resumeUsed: boolean };

export default function PitchPractice({ initialResumeText }: { initialResumeText: string }) {
  const { language: uiLanguage } = useLanguage();
  const zh = uiLanguage === "zh";
  const l = (en: string, cn: string) => zh ? cn : en;
  const [language, setLanguage] = useState<PitchLanguageChoice>("auto");
  const [seconds, setSeconds] = useState(30);
  const [remaining, setRemaining] = useState(30);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [resumeText, setResumeText] = useState(initialResumeText.slice(0, 6000));
  const [reference, setReference] = useState<Feedback | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const duration = useRef(0);
  const generation = useRef(0);
  const url = useRef("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const request = useRef<AbortController | null>(null);
  const starting = useRef(false);

  useEffect(() => () => {
    generation.current++;
    request.current?.abort();
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    setRecording(false);
  }

  async function send(form: FormData) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const response = await fetch("/api/pitch", { method: "POST", body: form, signal: controller.signal });
    if (response.status === 403) { window.location.assign("/pricing"); throw new Error("access_expired"); }
    if (!response.ok) throw new Error("request_failed");
    return response.json();
  }

  async function start() {
    if (starting.current || recording || busy) return;
    starting.current = true;
    const current = ++generation.current;
    setError(""); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (current !== generation.current) { mic.getTracks().forEach(track => track.stop()); return; }
      stream.current = mic;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(mic, mimeType ? { mimeType } : undefined);
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      rec.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      rec.onstop = async () => {
        if (current !== generation.current) return;
        duration.current = Math.min(seconds, (performance.now() - started.current) / 1000);
        const blob = new Blob(chunks, { type: rec.mimeType });
        if (url.current) URL.revokeObjectURL(url.current);
        url.current = URL.createObjectURL(blob); setAudioUrl(url.current);
        setBusy(true);
        try {
          const form = new FormData(); form.append("audio", blob, rec.mimeType.includes("mp4") ? "pitch.mp4" : "pitch.webm"); form.append("language", language);
          const result = await send(form);
          if (current === generation.current) setText(result.text || "");
        } catch {
          if (current === generation.current) setError(l("Transcription failed. Replay your recording or type your pitch below.", "识别失败，可回听录音并手动输入演讲内容。"));
        } finally { if (current === generation.current) setBusy(false); }
      };
      setText(""); setFeedback(null);
      if (url.current) { URL.revokeObjectURL(url.current); url.current = ""; }
      setAudioUrl(""); setRemaining(seconds); setRecording(true);
      started.current = performance.now(); rec.start();
      timer.current = setInterval(() => {
        const left = Math.max(0, seconds - Math.floor((performance.now() - started.current) / 1000));
        setRemaining(left); if (!left) stop();
      }, 100);
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());
      setError(l("Microphone unavailable. Allow microphone access, or type your pitch below.", "无法使用麦克风，请允许录音权限，或直接输入演讲内容。"));
    } finally { starting.current = false; if (current === generation.current) setBusy(false); }
  }

  async function grade() {
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("text", text); form.append("language", language); form.append("seconds", String(seconds)); form.append("duration", String(duration.current));
      form.append("resumeText", resumeText);
      const result: Feedback = await send(form);
      setFeedback(result); setReference(result);
    } catch { setError(l("Could not get feedback. Your answer is kept; please retry.", "反馈生成失败，内容已保留，请重试。")); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 text-[#17201e]">
    <Link href="/dashboard" className="underline">{l("← Dashboard", "← 练习中心")}</Link>
    <h1 className="text-3xl font-semibold">{l("Your elevator pitch", "30–60 秒电梯演讲")}</h1>
    <p>{l("Introduce yourself, show your value, then close with your goal. Feedback combines your words with your résumé background to recommend a personalized pitch template.", "你是谁 → 你能带来的价值 → 一个具体例子 → 你的目标。系统会结合本次表达和简历背景，给出适合你的推荐模板，可对照反复练习。")}</p>
    <div className="flex flex-wrap gap-6">
      <label>{l("Target length", "目标时长")} <select disabled={recording || busy} value={seconds} onChange={e => { const value = Number(e.target.value); setSeconds(value); setRemaining(value); setFeedback(null); setReference(null); }}><option value={30}>30 {l("seconds", "秒")}</option><option value={60}>60 {l("seconds", "秒")}</option></select></label>
      <label>{l("Speech & feedback language", "演讲及反馈语言")} <select value={language} disabled={recording || busy} onChange={e => { setLanguage(e.target.value as PitchLanguageChoice); setFeedback(null); setReference(null); }}><option value="auto">{l("Auto · follow résumé language", "自动 · 跟随简历语言")}</option>{Object.entries(PITCH_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{code === "zh" ? "中文" : name}</option>)}</select></label>
    </div>
    <p className="text-sm text-[#52605a]">{language === "auto" ? l("Feedback and the recommended template follow the predominant language of your résumé. Without a résumé, they follow your speech. You can override this above; the interface language stays separate.", "反馈和推荐模板默认跟随简历的主要语言；没有简历时跟随你说的语言。也可手动指定，界面语言独立设置。") : l("Your selected language applies to transcription, feedback and the recommended template.", "已按你的手动选择设置语音识别、反馈和推荐模板语言。")}</p>
    <details className="rounded-2xl border border-[#17201e]/15 bg-[#e3eee7] p-4" open={!initialResumeText}>
      <summary className="cursor-pointer font-medium">{resumeText.trim() ? l("Résumé background included · review or edit", "已加入简历背景 · 可查看和修改") : l("Add résumé background for a personalized template", "添加简历背景，获取更贴合经历的模板")}</summary>
      <p className="mt-3 text-sm text-[#52605a]">{initialResumeText ? l("Your saved résumé is loaded. Only this practice uses edits here; your saved résumé stays unchanged.", "已载入你保存的简历。在此修改只用于本次练习，不会覆盖已保存的简历。") : l("Paste your role, experience and achievements. You can also continue without a résumé; the template will use only what you say.", "可粘贴岗位、工作经历和成果；没有简历也可练习，模板将仅依据你本次表达生成。")}</p>
      <label className="mt-3 block text-sm">{l("Résumé / background", "简历／个人背景")}<textarea rows={5} maxLength={6000} value={resumeText} disabled={recording || busy} onChange={e => { setResumeText(e.target.value); setFeedback(null); setReference(null); }} className="mt-2 w-full rounded-xl border bg-white p-3" /></label>
      <p className="mt-2 text-xs text-[#52605a]">{l("The background is sent with your pitch for coaching. Contact details are removed before analysis; include only relevant experience.", "背景内容会与演讲一起用于分析，分析前会移除联系方式，建议仅提供相关经历。")}</p>
    </details>
    <section className="rounded-2xl border bg-white p-6 space-y-4">
      <p className="text-5xl font-mono tabular-nums" role="timer">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
      <button disabled={busy && !recording} onClick={recording ? stop : start} className="rounded-full bg-[#17201e] px-6 py-3 text-white disabled:opacity-50">{recording ? l("Stop & review", "停止并检查") : l("Record a new attempt", "开始新一轮录音")}</button>
      {audioUrl && <audio className="w-full" controls src={audioUrl} aria-label={l("Replay your attempt", "回听本次录音")} />}
      <label className="block">{l("Review or type your pitch", "检查识别文字或直接输入演讲内容")}<textarea className="mt-2 w-full rounded-xl border p-3" rows={6} maxLength={4000} value={text} disabled={recording || busy} onChange={e => { setText(e.target.value); setFeedback(null); }} /></label>
      <button onClick={grade} disabled={recording || busy || !text.trim()} className="rounded-full bg-indigo-600 px-6 py-3 text-white disabled:opacity-50">{busy ? l("Processing…", "正在处理…") : l("Get feedback", "提交并获取反馈")}</button>
      <p className="text-xs text-gray-500">{l("Audio stays in this browser for replay and is sent for transcription. This quick practice is not saved to interview history. Feedback assesses content, not pronunciation.", "录音在当前页面供回听，并发送进行语音识别。快速练习不保存到面试历史，反馈评估内容，不评估发音。")}</p>
    </section>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {feedback && <section className="space-y-4 rounded-2xl border bg-white p-6" aria-live="polite">
      <h2 className="text-xl font-semibold">{l("Your pitch score", "本次表达得分")} {feedback.score}/100</h2>
      <p className="whitespace-pre-wrap">{feedback.feedback}</p>
    </section>}
    {reference && <section className="space-y-4 rounded-2xl border bg-emerald-50 p-6" aria-live="polite">
      <h2 className="text-xl font-semibold">{l("Your recommended elevator pitch template", "为你推荐的电梯演讲模板")}</h2>
      <p className="text-xs font-medium text-[#52605a]">{l("Template language", "模板语言")} · {PITCH_LANGUAGES[reference.language]}</p>
      <p className="text-sm text-[#52605a]">{reference.resumeUsed ? l("Based on your pitch and résumé background", "综合本次表达与简历背景生成") : l("Based on your pitch only — no résumé background provided", "仅依据本次表达生成，尚未提供简历背景")}</p>
      <ol className="list-inside list-decimal space-y-1 text-sm">{reference.templateOutline.map((section, index) => <li key={index}>{section}</li>)}</ol>
      <p className="whitespace-pre-wrap rounded-xl bg-white p-4 leading-7">{reference.improvedPitch}</p>
      <h3 className="font-semibold">{l("Why this fits you & what to confirm", "推荐依据与待确认信息")}</h3>
      <p className="whitespace-pre-wrap text-sm leading-6">{reference.personalizationNotes}</p>
      <p className="text-xs text-[#52605a]">{l("Confirm all facts and replace placeholders before using this pitch. The template stays visible while you record another attempt.", "使用前请确认事实并补全占位内容。重新录音时模板会保持显示，方便对照练习。")}</p>
      <button onClick={start} disabled={busy || recording} className="rounded-full border border-emerald-700 px-5 py-3 disabled:opacity-50">{l("Practice with this template", "对照这个模板再练一遍")}</button>
    </section>}
  </main>;
}
