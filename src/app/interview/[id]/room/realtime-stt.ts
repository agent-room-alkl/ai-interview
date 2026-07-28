// Live speech-to-text over WebRTC straight to the OpenAI Realtime API.
// The browser mic (with echo cancellation, so the AI's own TTS is removed) is
// streamed to OpenAI; interim + final transcripts and server-VAD turn events
// come back over the data channel. No audio touches our server; the long-lived
// key never reaches the client (we mint a short-lived ephemeral secret first).

export interface RealtimeSTTController {
  close(): void;
  setMuted(muted: boolean): void;
}

export interface RealtimeSTTCallbacks {
  onOpen?: () => void;
  onSpeechStart?: () => void; // server VAD detected the candidate starting to talk
  onInterim?: (text: string) => void; // running partial transcript for the turn
  onFinal?: (text: string) => void; // one completed utterance
  onError?: (message: string) => void;
}

const OPENAI_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const OPENAI_LEGACY_URL = "https://api.openai.com/v1/realtime";

// POST the SDP offer to OpenAI and return the answer SDP. Tries the GA /calls
// endpoint, then falls back to the legacy /realtime endpoint.
async function exchangeSdp(offerSdp: string, token: string): Promise<string> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/sdp",
  };
  let res = await fetch(OPENAI_CALLS_URL, {
    method: "POST",
    body: offerSdp,
    headers,
  });
  if (res.status === 404) {
    res = await fetch(OPENAI_LEGACY_URL, {
      method: "POST",
      body: offerSdp,
      headers,
    });
  }
  if (!res.ok) throw new Error(`sdp_exchange_${res.status}`);
  return res.text();
}

export async function connectRealtimeSTT(
  interviewId: string,
  cb: RealtimeSTTCallbacks,
): Promise<RealtimeSTTController> {
  // Mic first (front-loads the permission prompt); echo cancellation keeps the
  // AI's TTS out of what we send upstream.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const cleanupStream = () => stream.getTracks().forEach((t) => t.stop());

  let tokenValue: string;
  try {
    const tokRes = await fetch(`/api/interview/${interviewId}/realtime-token`, {
      method: "POST",
    });
    if (!tokRes.ok) throw new Error(`token_${tokRes.status}`);
    const data = (await tokRes.json()) as { value?: string };
    tokenValue = data.value ?? "";
    if (!tokenValue) throw new Error("token_empty");
  } catch (e) {
    cleanupStream();
    throw e;
  }

  const pc = new RTCPeerConnection();
  const track = stream.getAudioTracks()[0];
  if (track) pc.addTrack(track, stream);

  // Accumulate delta chunks into a per-turn interim string; reset on completed.
  let interim = "";
  const dc = pc.createDataChannel("oai-events");
  dc.onopen = () => cb.onOpen?.();
  dc.onmessage = (ev) => {
    let msg: {
      type?: string;
      delta?: string;
      transcript?: string;
      error?: { message?: string };
    };
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case "input_audio_buffer.speech_started":
        interim = "";
        cb.onSpeechStart?.();
        break;
      case "conversation.item.input_audio_transcription.delta":
        if (msg.delta) {
          interim += msg.delta;
          cb.onInterim?.(interim);
        }
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const finalText = (msg.transcript ?? interim).trim();
        interim = "";
        if (finalText) cb.onFinal?.(finalText);
        break;
      }
      case "error":
        cb.onError?.(msg.error?.message ?? "realtime error");
        break;
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answerSdp = await exchangeSdp(offer.sdp ?? "", tokenValue);
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  } catch (e) {
    try {
      pc.close();
    } catch {
      /* noop */
    }
    cleanupStream();
    throw e;
  }

  return {
    setMuted(muted: boolean) {
      if (track) track.enabled = !muted;
    },
    close() {
      try {
        dc.close();
      } catch {
        /* noop */
      }
      try {
        pc.close();
      } catch {
        /* noop */
      }
      cleanupStream();
    },
  };
}
