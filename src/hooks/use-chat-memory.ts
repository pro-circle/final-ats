import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";

const KEY = "ats-engine:assistant-conversation";
const MAX_MESSAGES = 60;

/** Reads the saved conversation (browser only). */
export function loadConversation(): UIMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((m) => m && typeof m === "object" && Array.isArray(m.parts)) as UIMessage[];
  } catch {
    return [];
  }
}

export function clearConversation() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Keeps a single career-assistant conversation in this browser so the
 * assistant remembers the thread across reloads and between the full page
 * and the floating bubble. Restores once after mount (SSR-safe), then saves
 * on every change.
 */
export function useChatMemory(
  messages: UIMessage[],
  setMessages: (m: UIMessage[]) => void,
  streaming: boolean,
) {
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = loadConversation();
    if (saved.length) setMessages(saved);
  }, [setMessages]);

  useEffect(() => {
    if (!restored.current || streaming) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      /* quota or private mode — memory stays in-session only */
    }
  }, [messages, streaming]);
}
