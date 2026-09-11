import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

/**
 * Shared "work in progress" visuals.
 *
 * `GeneratingPanel` fills the empty space a result will occupy: an animated
 * progress bar that creeps towards 95%, rotating status lines and skeleton
 * rows, so the page never looks frozen while the AI is working.
 */

export function ProgressBar({
  value,
  className = "",
}: {
  value?: number;
  className?: string;
}) {
  const indeterminate = value === undefined;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value)}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface ${className}`}
    >
      {indeterminate ? (
        <div className="h-full w-1/3 animate-[shimmer-slide_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      )}
    </div>
  );
}

/** Ticks a fake-but-honest progress value that eases towards 95%. */
export function useCreepingProgress(active: boolean, actual?: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    setValue(6);
    const t = setInterval(() => {
      setValue((v) => (v >= 95 ? 95 : v + Math.max(0.6, (95 - v) / 18)));
    }, 320);
    return () => clearInterval(t);
  }, [active]);
  return actual ?? value;
}

export function GeneratingPanel({
  title = "Generating…",
  stages,
  percent,
  rows = 4,
  className = "",
}: {
  title?: string;
  stages?: string[];
  percent?: number;
  rows?: number;
  className?: string;
}) {
  const list = stages?.length ? stages : ["Thinking", "Drafting", "Polishing"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % list.length), 2200);
    return () => clearInterval(t);
  }, [list.length]);

  return (
    <div
      aria-live="polite"
      className={`animate-ats-pop-in rounded-xl border border-dashed border-accent/40 bg-accent/[0.04] p-4 sm:p-6 ${className}`}
    >
      <div className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-sm font-semibold">
        <Sparkles className="animate-ats-float size-4 shrink-0 text-accent" />
        <span className="truncate">{title}</span>
      </div>
      <ProgressBar value={percent} />
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 shrink-0 animate-spin" />
        <span key={list[i]} className="animate-ats-fade-up truncate">
          {list[i]}
        </span>
        <span className="ats-dots ml-1 inline-flex shrink-0 items-end gap-0.5">
          <span />
          <span />
          <span />
        </span>
        {percent !== undefined && (
          <span className="ml-auto shrink-0 font-mono text-[10px]">{Math.round(percent)}%</span>
        )}
      </div>
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="ats-skeleton h-3"
            style={{ width: `${92 - r * 11}%`, animationDelay: `${r * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact inline variant for buttons rows and cards. */
export function GeneratingInline({ label = "Working…" }: { label?: string }) {
  return (
    <div className="animate-ats-fade-up flex items-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="size-3.5 shrink-0 animate-spin text-accent" />
      <span className="truncate">{label}</span>
      <span className="ats-dots inline-flex items-end gap-0.5">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}

/** Generic shimmering placeholder block. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`ats-skeleton ${className}`} />;
}

/** Rows of shimmering placeholders for lists and tables. */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="ats-stagger divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 p-4">
          <div className="ats-skeleton size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="ats-skeleton h-3 w-1/3" />
            <div className="ats-skeleton h-2.5 w-2/3" />
          </div>
          <div className="ats-skeleton hidden h-3 w-16 sm:block" />
        </div>
      ))}
    </div>
  );
}
