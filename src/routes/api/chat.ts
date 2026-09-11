import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

/**
 * Streaming chat for the Career Assistant.
 * Model: OpenRouter `google/gemma-4-26b-a4b-it:free` (Groq pool as failover).
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: unknown; system?: string };
        try {
          body = (await request.json()) as { messages?: unknown; system?: string };
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return new Response("Messages are required", { status: 400 });
        }

        const { hasAnyProvider, providerChain, markKeyFailed, MISSING_KEYS_MESSAGE } = await import(
          "@/lib/ai-provider.server"
        );
        if (!hasAnyProvider()) {
          return new Response(MISSING_KEYS_MESSAGE, { status: 500 });
        }

        const messages = body.messages as UIMessage[];
        let modelMessages;
        try {
          modelMessages = await convertToModelMessages(messages);
        } catch {
          return new Response("Malformed message history", { status: 400 });
        }

        const chain = providerChain("chat");
        const system =
          body.system ??
          [
            "You are ATS Engine, an intelligent career and hiring assistant.",
            "Answer in tight, well-ordered markdown so it is instantly scannable:",
            "- Open with one short direct sentence answering the question.",
            "- Then at most 3-5 short bullets or numbered steps, one idea each.",
            "- Bold only the key term in a bullet; no emoji, no filler, no repetition.",
            "- Use a small table only when comparing 2+ options; use fenced code only for code.",
            "- Close with a single next-step line when it is genuinely useful.",
            "Never restate the question, never apologise, never pad. Stay under ~180 words unless the user asks for depth.",
          ].join("\n");


        // Try each key in turn; the first stream that starts wins.
        for (let i = 0; i < chain.length; i++) {
          const attempt = chain[i];
          const isLast = i === chain.length - 1;
          try {
            const result = streamText({
              model: attempt.model,
              system,
              messages: modelMessages,
              onError: ({ error }: { error: unknown }) => {
                markKeyFailed(attempt.key);
                console.error(`[chat] ${attempt.provider} stream error`, error);
              },
            });
            // Surface an immediate auth/rate error before committing to a stream.
            await result.warnings;
            return result.toUIMessageStreamResponse({ originalMessages: messages });
          } catch (err) {
            markKeyFailed(attempt.key);
            console.error(`[chat] ${attempt.provider} failed`, err);
            if (isLast) {
              return new Response(
                err instanceof Error ? err.message : "Assistant is unavailable right now.",
                { status: 502 },
              );
            }
          }
        }
        return new Response(MISSING_KEYS_MESSAGE, { status: 500 });
      },
    },
  },
});
