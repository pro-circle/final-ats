import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Server-side streaming voice input.
 *
 * Captures microphone PCM with the Web Audio API and, every few seconds,
 * encodes the buffered samples into a complete 16 kHz mono WAV file and posts
 * it to `/api/transcribe`. Each window's text is appended, so the transcript
 * grows while the user is still speaking — no waiting for the whole clip.
 *
 * WAV (rather than MediaRecorder chunks) keeps every upload independently
 * decodable, including on iOS Safari.
 */

const TARGET_RATE = 16_000;
const WINDOW_MS = 4000;

function downsample(chunks: Float32Array[], from: number): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  if (from <= TARGET_RATE) return merged;
  const ratio = from / TARGET_RATE;
  const out = new Float32Array(Math.floor(merged.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = merged[Math.floor(i * ratio)] ?? 0;
  return out;
}

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** True when the window has anything louder than room noise. */
function hasSpeech(samples: Float32Array): boolean {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) ** 2;
  return Math.sqrt(sum / Math.max(1, samples.length)) > 0.008;
}

export function useVoiceStream(options?: { lang?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(0);
  const lang = options?.lang ?? "en";

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext),
    );
  }, []);

  const flush = useCallback(async () => {
    const ctx = ctxRef.current;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    if (!ctx || !chunks.length) return;
    const samples = downsample(chunks, ctx.sampleRate);
    if (samples.length < TARGET_RATE / 2 || !hasSpeech(samples)) return;

    const form = new FormData();
    form.append("file", encodeWav(samples), "recording.wav");
    form.append("language", lang);

    inFlightRef.current += 1;
    setTranscribing(true);
    try {
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text().catch(() => "Transcription failed"));
      const data = (await res.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      if (text) setTranscript((prev) => (prev ? `${prev} ${text}` : text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transcribe that audio.");
    } finally {
      inFlightRef.current -= 1;
      if (inFlightRef.current <= 0) setTranscribing(false);
    }
  }, [lang]);

  const teardown = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
  }, []);

  const stop = useCallback(async () => {
    setListening(false);
    teardown();
    await flush();
    const ctx = ctxRef.current;
    ctxRef.current = null;
    await ctx?.close().catch(() => undefined);
  }, [flush, teardown]);

  const start = useCallback(async () => {
    if (listening) return;
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access is blocked. Allow it in your browser, then try again.");
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => {
      chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(node);
    node.connect(ctx.destination);

    ctxRef.current = ctx;
    streamRef.current = stream;
    sourceRef.current = source;
    nodeRef.current = node;
    chunksRef.current = [];
    timerRef.current = window.setInterval(() => void flush(), WINDOW_MS);
    setListening(true);
  }, [flush, listening]);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      teardown();
      void ctxRef.current?.close().catch(() => undefined);
      ctxRef.current = null;
    };
  }, [teardown]);

  return { supported, listening, transcribing, transcript, error, start, stop, reset };
}
