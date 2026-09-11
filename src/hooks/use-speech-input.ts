import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Streaming voice input via the browser's on-device speech recognition.
 *
 * The engine ends a session on every natural pause (and Chrome caps a session
 * at roughly a minute), so we keep an explicit `wantedRef` and restart the
 * recognizer until the user actually presses stop. Harmless engine errors
 * (`no-speech`, `aborted`) never surface to the UI.
 *
 * `interim` updates live while speaking; `transcript` holds finalized text.
 */
export function useSpeechInput(options?: { onFinal?: (text: string) => void; lang?: string }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantedRef = useRef(false);
  const onFinalRef = useRef(options?.onFinal);
  onFinalRef.current = options?.onFinal;
  const lang = options?.lang ?? "en-US";

  useEffect(() => {
    setSupported(!!getRecognitionCtor());
    return () => {
      wantedRef.current = false;
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const spawn = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);

    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = (res?.[0]?.transcript ?? "").trim();
        if (!text) continue;
        if (res.isFinal) {
          setTranscript((prev) => (prev ? `${prev} ${text}` : text));
          onFinalRef.current?.(text);
        } else {
          live += `${text} `;
        }
      }
      setInterim(live.trim());
    };

    rec.onerror = (e) => {
      const code = e.error ?? "";
      // Pauses and self-restarts are normal; don't alarm the user.
      if (code === "no-speech" || code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        wantedRef.current = false;
        setError("Microphone access is blocked. Allow it in your browser, then try again.");
      } else if (code === "audio-capture") {
        wantedRef.current = false;
        setError("No microphone was found.");
      } else if (code === "network") {
        setError("Voice recognition lost its connection — retrying.");
      }
    };

    rec.onend = () => {
      recRef.current = null;
      if (wantedRef.current) {
        // Natural pause: restart so long answers keep recording.
        window.setTimeout(() => {
          if (wantedRef.current && !recRef.current) spawn();
        }, 250);
      } else {
        setListening(false);
        setInterim("");
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      recRef.current = null;
    }
  }, [lang]);

  const start = useCallback(async () => {
    if (!getRecognitionCtor()) {
      setError("Voice input isn't supported in this browser. Type your answer instead.");
      return;
    }
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Voice input needs a secure (https) connection.");
      return;
    }
    setError(null);
    // Prompt for permission up front so the first click gives clear feedback.
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Microphone access is blocked. Allow it in your browser, then try again.");
      return;
    }
    if (recRef.current) return;
    wantedRef.current = true;
    setListening(true);
    spawn();
  }, [spawn]);

  const stop = useCallback(() => {
    wantedRef.current = false;
    setListening(false);
    try {
      recRef.current?.stop();
    } catch {
      recRef.current?.abort?.();
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, error, start, stop, reset, setTranscript };
}
