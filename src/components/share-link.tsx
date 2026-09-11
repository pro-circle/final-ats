import { useState } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ensureShareLink } from "@/lib/share.functions";

/** Short label shown on the button. */
export function shareAlias(jobId: string) {
  return `/share/${jobId}`;
}

/** The real, working shareable link for a job. */
export function shareUrl(slugOrId: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/share/${slugOrId}`;
}

/** Clipboard with a fallback for browsers that block the async API. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function ShareLink({ jobId, compact = false }: { jobId: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(jobId);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setBusy(true);
    try {
      const res = await ensureShareLink({ data: { jobId } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const target = res.share?.slug ?? jobId;
      setSlug(target);
      // Prefer the server's absolute URL; fall back to this tab's origin.
      const link = res.share?.url?.startsWith("http") ? res.share.url : shareUrl(target);
      const ok = await copyToClipboard(link);
      setCopied(ok);
      if (ok) {
        toast.success("Shareable link copied", { description: link });
        setTimeout(() => setCopied(false), 1800);
      } else {
        toast.info("Copy this link", { description: link, duration: 12000 });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create share link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={copy}
      disabled={busy}
      title={`Copy ${shareUrl(slug)}`}
      className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-surface font-mono text-[10px] text-foreground/80 hover:border-brand/40 hover:text-foreground disabled:opacity-60 ${
        compact ? "px-2 py-1" : "px-3 py-1.5 text-xs"
      }`}
    >
      {busy ? (
        <Loader2 className="size-3 animate-spin" />
      ) : copied ? (
        <Check className="size-3 text-accent" />
      ) : (
        <Copy className="size-3" />
      )}
      {shareAlias(jobId)}
    </button>
  );
}
