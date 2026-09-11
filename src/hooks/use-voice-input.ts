import { useEffect, useState } from "react";
import { useSpeechInput } from "@/hooks/use-speech-input";
import { useVoiceStream } from "@/hooks/use-voice-stream";

/**
 * One mic for the whole app.
 *
 * Uses the browser's on-device speech recognition when it exists (Chrome,
 * Edge) and falls back to server-side Groq Whisper streaming everywhere else
 * (Safari, Firefox, in-app browsers). Callers get a single shape and never
 * need to know which engine answered.
 */
export function useVoiceInput(options?: { lang?: string }) {
  const speech = useSpeechInput({ lang: options?.lang ?? "en-US" });
  const cloud = useVoiceStream({ lang: (options?.lang ?? "en-US").slice(0, 2) });

  // Decide once, after mount: `supported` starts false during SSR/hydration.
  const [engine, setEngine] = useState<"speech" | "cloud" | null>(null);
  useEffect(() => {
    if (engine) return;
    if (speech.supported) setEngine("speech");
    else if (cloud.supported) setEngine("cloud");
  }, [engine, speech.supported, cloud.supported]);

  const useCloud = engine === "cloud";

  return {
    supported: speech.supported || cloud.supported,
    listening: useCloud ? cloud.listening : speech.listening,
    transcribing: cloud.transcribing,
    transcript: useCloud ? cloud.transcript : speech.transcript,
    interim: useCloud ? "" : speech.interim,
    error: useCloud ? cloud.error : speech.error,
    start: () => {
      if (useCloud) void cloud.start();
      else void speech.start();
    },
    stop: () => {
      if (useCloud) void cloud.stop();
      else speech.stop();
    },
    reset: () => {
      cloud.reset();
      speech.reset();
    },
  };
}
