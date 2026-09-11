import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessagesSquare, X, Send, Sparkles } from "lucide-react";
import { AiMarkdown } from "@/components/ai-markdown";
import { useChatMemory } from "@/hooks/use-chat-memory";

const POSITION_KEY = "ats-engine:floating-assistant-position";
const BUTTON_SIZE = 56;
const MARGIN = 24;
const DRAG_CLICK_THRESHOLD = 8;

function clampPosition(x: number, y: number) {
  if (typeof window === "undefined") return { x, y };
  const maxX = -(window.innerWidth - BUTTON_SIZE - MARGIN);
  const maxY = -(window.innerHeight - BUTTON_SIZE - MARGIN);
  return {
    x: Math.max(maxX, Math.min(0, x)),
    y: Math.max(maxY, Math.min(0, y)),
  };
}

/** Floating career-assistant bubble. Rendered only when the user enables it. */
export function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0, moved: false });

  const { messages, setMessages, sendMessage, status } = useChat({
    id: "career-assistant",
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";
  useChatMemory(messages, setMessages, status === "streaming");

  // Restore saved position on mount and keep it inside the viewport.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        setPosition(clampPosition(parsed.x, parsed.y));
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Re-clamp when the viewport changes size.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setPosition((p) => clampPosition(p.x, p.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (!nearBottom && !open) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, open, status]);

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
      moved: false,
    };
    setDragging(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD) {
      dragRef.current.moved = true;
    }
    setPosition(clampPosition(dragRef.current.posX + dx, dragRef.current.posY + dy));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const target = e.currentTarget;
    target.releasePointerCapture(e.pointerId);
    setDragging(false);
    setPosition((p) => {
      const clamped = clampPosition(p.x, p.y);
      try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(clamped));
      } catch {
        // storage may be unavailable
      }
      return clamped;
    });
    if (!dragRef.current.moved) {
      setOpen((v) => !v);
    }
  }

  const transformStyle = {
    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    transition: dragging ? "none" : "transform 200ms ease-out",
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      style={transformStyle}
    >
      {open && (
        <div className="absolute bottom-[72px] right-0 z-50 flex h-[460px] w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-accent" /> Career assistant
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div ref={scrollRef} className="ats-stream-scroll flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Ask about interviews, offers, or your next move.
              </p>
            )}
            {messages.map((m, i) => {
              const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
              const isStreaming =
                status === "streaming" && m.role === "assistant" && i === messages.length - 1;
              return (
                <div
                  key={m.id}
                  className={`ats-stream-body min-w-0 max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "assistant"
                      ? "border border-border/60 bg-surface text-foreground"
                      : "ml-auto bg-brand text-brand-foreground"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <AiMarkdown streaming={isStreaming}>{text}</AiMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{text}</p>
                  )}
                </div>
              );
            })}
            <div
              aria-live="polite"
              className={`ats-status-row text-[11px] text-muted-foreground ${busy ? "opacity-100" : "opacity-0"}`}
            >
              <span>{status === "streaming" ? "Writing" : "Thinking"}</span>
              <span className="ats-dots inline-flex items-end gap-0.5">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = input.trim();
              if (!t || busy) return;
              setInput("");
              void sendMessage({ text: t });
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-accent/20"
            />
            <button
              type="submit"
              disabled={busy}
              className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground disabled:opacity-60"
              aria-label="Send"
            >
              <Send className="size-3.5" />
            </button>
          </form>
        </div>
      )}

      <button
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label="Career assistant"
        title="Career assistant (drag to move)"
        className={`grid size-14 touch-none place-items-center rounded-full bg-accent text-accent-foreground shadow-xl transition-transform ${
          dragging ? "scale-110 cursor-grabbing" : "cursor-grab hover:scale-105"
        }`}
      >
        <MessagesSquare className="size-6" />
      </button>
    </div>
  );
}
