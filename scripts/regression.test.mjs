import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

async function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const billing = await load("../src/lib/billing.ts");
const { PcmBuffer } = await load("../src/lib/pcm.ts");
const now = new Date("2026-10-15T00:00:00Z");
const expired = new Date(now.getTime() - 1);
const active = new Date(now.getTime() + 1);

test("only $3/week and $9/month can be purchased", () => {
  assert.deepEqual(billing.PACK_IDS, ["week", "month"]);
  assert.equal(billing.getPack("week").amountCents, 300);
  assert.equal(billing.getPack("week").days, 7);
  assert.equal(billing.getPack("month").amountCents, 900);
  assert.equal(billing.getPack("month").days, 30);
  assert.equal(billing.isPackId("day"), false);
});

test("first use unlocks all durations and uses an exact 24-hour window", () => {
  assert.equal(billing.TRIAL_WINDOW_MS, 86400000);
  for (const durationMinutes of [10, 20, 30]) {
    assert.deepEqual(billing.canStartSession({ accessUntil: null, trialUsed: false, durationMinutes, now }), { ok: true, via: "trial" });
  }
});

test("active trial permits repeated sessions; expiry cannot reset the trial", () => {
  for (const durationMinutes of [10, 20, 30]) {
    assert.equal(billing.canStartSession({ accessUntil: null, trialUsed: true, trialEndsAt: active, durationMinutes, now }).ok, true);
    for (const trialEndsAt of [expired, now, null]) {
      assert.equal(billing.canStartSession({ accessUntil: null, trialUsed: true, trialEndsAt, durationMinutes, now }).ok, false);
    }
  }
});

test("paid access survives trial expiry; malformed durations are rejected", () => {
  assert.deepEqual(billing.canStartSession({ accessUntil: active, trialUsed: true, trialEndsAt: expired, durationMinutes: 30, now }), { ok: true, via: "paid" });
  for (const durationMinutes of [0, 1, 60, NaN]) assert.equal(billing.canStartSession({ accessUntil: active, trialUsed: false, durationMinutes, now }).ok, false);
});

test("purchases stack by their stored days and refunds remove those days", () => {
  const current = billing.extendAccessUntil(null, 1, now);
  const stacked = billing.extendAccessUntil(current, 7, now);
  assert.equal(stacked.getTime() - now.getTime(), 8 * 86400000);
  assert.equal(billing.shortenAccessUntil(stacked, 7, now).getTime(), current.getTime());
  assert.equal(billing.extendAccessUntil(expired, 30, now).getTime() - now.getTime(), 30 * 86400000);
});

test("refund window uses payment time", () => {
  assert.equal(billing.canRequestRefund({ status: "paid", paidAt: now, now: new Date(now.getTime() + 3600000) }).ok, true);
  assert.equal(billing.canRequestRefund({ status: "paid", paidAt: now, now: new Date(now.getTime() + 86400001) }).ok, false);
  assert.equal(billing.canRequestRefund({ status: "refunded", paidAt: now, now }).ok, false);
});

test("PCM accumulates tiny network packets instead of scheduling short, stuttering blocks", () => {
  const pcm = new PcmBuffer(8);
  assert.equal(pcm.push(new Uint8Array([1, 0, 255])).length, 0);
  assert.equal(pcm.push(new Uint8Array([255, 0])).length, 0);
  assert.deepEqual([...pcm.push(new Uint8Array([128, 255, 127, 2]))], [1, -1, -32768, 32767]);
  assert.deepEqual([...pcm.push(new Uint8Array([0]), true)], [2]);
});

test("PCM flush preserves short final blocks and ignores an incomplete sample", () => {
  const pcm = new PcmBuffer();
  assert.equal(pcm.push(new Uint8Array([42, 0, 11])).length, 0);
  assert.deepEqual([...pcm.push(new Uint8Array(), true)], [42]);
});

test("discarded speech cannot reappear from a late transcript; closing releases the mic", async () => {
  const saved = Object.fromEntries(["navigator", "RTCPeerConnection", "fetch"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const { connectRealtimeSTT } = await load("../src/app/interview/[id]/room/realtime-stt.ts");
  let stopped = 0;
  let closed = 0;
  let dc;
  const track = { enabled: true, stop() { stopped++; } };
  const answers = [];
  let controller;
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } } });
    globalThis.RTCPeerConnection = class {
      addTrack() {}
      createDataChannel() { return dc = { readyState: "open", send() {}, close() {} }; }
      async createOffer() { return { sdp: "offer" }; }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() { closed++; }
    };
    globalThis.fetch = async url => String(url).includes("realtime-token")
      ? new Response(JSON.stringify({ value: "test-ephemeral-secret" }))
      : new Response("answer-sdp");
    controller = await connectRealtimeSTT("test", { onFinal: text => answers.push(text) });
    dc.onopen();
    const event = data => dc.onmessage({ data: JSON.stringify(data) });
    event({ type: "input_audio_buffer.speech_started", item_id: "discarded" });
    controller.discardPending();
    event({ type: "conversation.item.input_audio_transcription.completed", item_id: "discarded", transcript: "unwanted answer" });
    event({ type: "input_audio_buffer.speech_started", item_id: "retry" });
    event({ type: "conversation.item.input_audio_transcription.completed", item_id: "retry", transcript: "new answer" });
    assert.deepEqual(answers, ["new answer"]);
    controller.setMuted(true);
    assert.equal(track.enabled, false);
    controller.close(); controller = null;
    assert.equal(stopped, 1);
    assert.equal(closed, 1);
  } finally {
    controller?.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
