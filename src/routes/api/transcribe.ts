import { createFileRoute } from "@tanstack/react-router";

/**
 * Speech-to-text for streaming voice input.
 *
 * The client records short WAV windows and posts them here while the user is
 * still speaking; each window is transcribed with Groq `whisper-large-v3`
 * and the text is appended to the composer, so input appears as they talk.
 */
export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { groqKeys, markKeyFailed, GROQ_WHISPER_MODEL } = await import(
          "@/lib/ai-provider.server"
        );
        const keys = groqKeys();
        if (!keys.length) {
          return new Response("Voice transcription needs a GROQ_API_KEY.", { status: 500 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return new Response("Expected multipart/form-data audio upload", { status: 400 });
        }
        const audio = form.get("file");
        if (!(audio instanceof File) || audio.size < 2048) {
          return new Response("No usable audio in the request", { status: 400 });
        }
        if (audio.size > 20 * 1024 * 1024) {
          return new Response("Audio clip is too large", { status: 413 });
        }
        const language = String(form.get("language") ?? "").trim();

        let lastStatus = 500;
        let lastBody = "Transcription failed";
        for (const key of keys) {
          const upstream = new FormData();
          upstream.append("model", GROQ_WHISPER_MODEL);
          upstream.append("file", audio, audio.name || "recording.wav");
          upstream.append("response_format", "json");
          if (language) upstream.append("language", language);

          let res: Response;
          try {
            res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
              method: "POST",
              headers: { Authorization: `Bearer ${key}` },
              body: upstream,
            });
          } catch (err) {
            lastBody = err instanceof Error ? err.message : "Network error";
            markKeyFailed(key);
            continue;
          }

          if (res.ok) {
            const data = (await res.json().catch(() => ({}))) as { text?: string };
            return Response.json({ text: (data.text ?? "").trim() });
          }

          lastStatus = res.status;
          lastBody = await res.text().catch(() => "Transcription failed");
          console.error(`Groq transcription failed [${res.status}]: ${lastBody}`);
          if (res.status === 429 || res.status >= 500 || res.status === 401) {
            markKeyFailed(key);
            continue;
          }
          break;
        }

        return new Response(lastBody, { status: lastStatus });
      },
    },
  },
});
