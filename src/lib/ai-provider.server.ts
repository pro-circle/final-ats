/**
 * Server-only AI router. Two providers, two jobs:
 *
 *   1. OpenRouter — `google/gemma-4-26b-a4b-it:free`. Used for the
 *      conversational surfaces (Career Assistant chat, one-shot generators).
 *      Up to 2 keys, round-robined with cooldown on failure.
 *   2. Groq — `openai/gpt-oss-120b`. Used for every agentic/structured task
 *      (resume parsing, job-link evaluation, matching, auto-apply drafting).
 *      Up to 3 keys, round-robined with cooldown on failure.
 *
 * Either pool can cover for the other: chat falls back to Groq, agent work
 * falls back to OpenRouter. Never import this file from client code.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { serverEnv } from "./env.server";

/** Groq models for agentic/structured work, tried in order. */
export const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;
export const GROQ_MODEL = GROQ_MODELS[0];
/** Groq models for chat: the small model leads for latency, 120b backs it up. */
export const GROQ_CHAT_MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] as const;
/** Groq speech-to-text model (used by audio transcription, not text chat). */
export const GROQ_WHISPER_MODEL = "whisper-large-v3";
/** OpenRouter models, tried in order. First is the default. */
export const OPENROUTER_MODELS = [
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "deepseek/deepseek-chat-v3.1:free",
  "qwen/qwen3-235b-a22b:free",
  "mistralai/mistral-small-3.2-24b-instruct:free",
] as const;
export const OPENROUTER_MODEL = OPENROUTER_MODELS[0];


const COOLDOWN_MS = 60_000;
const cooldown = new Map<string, number>();
const cursors = { groq: 0, openrouter: 0 };

function dedupe(keys: (string | undefined)[]): string[] {
  return Array.from(new Set(keys.filter((k): k is string => !!k && k.trim().length > 8)));
}

export function groqKeys(): string[] {
  return dedupe([
    serverEnv("GROQ_API_KEY_1"),
    serverEnv("GROQ_API_KEY_2"),
    serverEnv("GROQ_API_KEY_3"),
    serverEnv("GROQ_API_KEY_4"),
    serverEnv("GROQ_API_KEY_5"),
    serverEnv("GROQ_API_KEY"),
  ]);
}

export function openRouterKeys(): string[] {
  return dedupe([
    serverEnv("OPENROUTER_API_KEY_1"),
    serverEnv("OPENROUTER_API_KEY_2"),
    serverEnv("OPENROUTER_API_KEY_3"),
    serverEnv("OPENROUTER_API_KEY_4"),
    serverEnv("OPENROUTER_API_KEY"),
  ]);
}


function healthy(all: string[]): string[] {
  const now = Date.now();
  const ok = all.filter((k) => (cooldown.get(k) ?? 0) < now);
  return ok.length ? ok : all;
}

export function markKeyFailed(key: string) {
  cooldown.set(key, Date.now() + COOLDOWN_MS);
}

/**
 * Providers and model handles are cached per key so repeat requests reuse a
 * warm client (and its keep-alive connection) instead of rebuilding one.
 */
const modelCache = new Map<string, LanguageModel>();

function cached(cacheKey: string, build: () => LanguageModel): LanguageModel {
  let m = modelCache.get(cacheKey);
  if (!m) {
    m = build();
    modelCache.set(cacheKey, m);
  }
  return m;
}

function groqModel(key: string, modelId: string): LanguageModel {
  return cached(`groq:${modelId}:${key}`, () =>
    createOpenAICompatible({
      name: "groq",
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: key,
    })(modelId),
  );
}

function openRouterModel(key: string, modelId: string): LanguageModel {
  return cached(`openrouter:${modelId}:${key}`, () =>
    createOpenAICompatible({
      name: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: key,
      headers: {
        "HTTP-Referer": serverEnv("APP_URL") ?? "http://localhost:5173",
        "X-Title": "ATS Engine",
      },
    })(modelId),
  );
}

export type Provider = "groq" | "openrouter";
export type Attempt = { provider: Provider; model: LanguageModel; key: string; modelId: string };

function pool(provider: Provider, kind: "chat" | "agent" = "agent"): Attempt[] {
  const keys = healthy(provider === "groq" ? groqKeys() : openRouterKeys());
  if (!keys.length) return [];
  const start = cursors[provider];
  const ordered = keys.map((_, i) => keys[(start + i) % keys.length]);
  cursors[provider] = (start + 1) % keys.length;

  // Try every key on the primary model first, then fall through the
  // remaining models (rate-limited free/shared models switch over).
  const models: readonly string[] =
    provider === "groq"
      ? kind === "chat"
        ? GROQ_CHAT_MODELS
        : GROQ_MODELS
      : OPENROUTER_MODELS;
  const attempts: Attempt[] = [];
  for (const modelId of models) {
    for (const key of ordered) {
      attempts.push({
        provider,
        key,
        modelId,
        model:
          provider === "groq" ? groqModel(key, modelId) : openRouterModel(key, modelId),
      });
    }
  }
  return attempts;
}

/**
 * Ordered attempts for a request.
 * `chat`  -> Groq `gpt-oss-20b` first (fastest, accurate), OpenRouter as failover.
 * `agent` -> Groq `gpt-oss-120b` first, OpenRouter as failover.
 */
export function providerChain(kind: "chat" | "agent" = "agent"): Attempt[] {
  return kind === "chat"
    ? [...pool("groq", "chat"), ...pool("openrouter", "chat")]
    : [...pool("groq", "agent"), ...pool("openrouter", "agent")];
}


export function hasAnyProvider(): boolean {
  return groqKeys().length > 0 || openRouterKeys().length > 0;
}

export const MISSING_KEYS_MESSAGE =
  "No AI provider configured. Add OPENROUTER_API_KEY_1..4 (chat) and GROQ_API_KEY_1..5 (agent) to your .env file.";

/** First model to try for a streaming endpoint. Throws when nothing is set. */
export function primaryModel(kind: "chat" | "agent" = "chat"): Attempt {
  const chain = providerChain(kind);
  if (!chain.length) throw new Error(MISSING_KEYS_MESSAGE);
  return chain[0];
}

/**
 * One-shot generation with automatic key/provider failover.
 * Always streams under the hood, then resolves the full text.
 */
export async function runAgent(opts: {
  system?: string;
  prompt: string;
  kind?: "chat" | "agent";
  maxOutputTokens?: number;
}): Promise<{ text: string; provider: string }> {
  const { streamText } = await import("ai");
  const chain = providerChain(opts.kind ?? "agent");
  if (!chain.length) throw new Error(MISSING_KEYS_MESSAGE);

  let lastErr: unknown;
  for (const attempt of chain) {
    try {
      const result = streamText({
        model: attempt.model,
        system: opts.system,
        prompt: opts.prompt,
        ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      });
      const text = await result.text;
      if (text?.trim()) return { text, provider: attempt.provider };
    } catch (err) {
      lastErr = err;
      markKeyFailed(attempt.key);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All AI providers failed");
}

/** Run the agent and parse the first JSON object it returns. */
export async function runAgentJson<T>(opts: {
  system?: string;
  prompt: string;
}): Promise<T | null> {
  const { text } = await runAgent(opts);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
