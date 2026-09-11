import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/routes/_app";
import { SectionCard } from "@/components/dashboard/primitives";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  dismissNotification,
  type NotificationItem,
} from "@/lib/notifications.functions";
import {
  Bell,
  Briefcase,
  MessageSquare,
  Award,
  Sparkles,
  Calendar,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_app/candidate/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · ATS Engine" },
      {
        name: "description",
        content:
          "Matches, interviews, offers, and messages from your job search in one live inbox.",
      },
      { property: "og:title", content: "Notifications · ATS Engine" },
      {
        property: "og:description",
        content: "Track matches, interviews, offers, and messages in one live inbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

type NotifType = NotificationItem["type"];

const iconFor: Record<NotifType, React.ComponentType<{ className?: string }>> = {
  match: Briefcase,
  message: MessageSquare,
  interview: Calendar,
  offer: Award,
  insight: Sparkles,
};

const toneFor: Record<NotifType, string> = {
  match: "bg-brand/10 text-brand",
  message: "bg-surface text-foreground/70",
  interview: "bg-accent/10 text-accent",
  offer: "bg-amber-100 text-amber-700",
  insight: "bg-purple-100 text-purple-700",
};

function NotificationsPage() {
  const [list, setList] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | NotifType>("all");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setList(await listNotifications());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = filter === "all" ? list : list.filter((n) => n.type === filter);
  const unreadCount = list.filter((n) => n.unread).length;

  async function markAll() {
    if (!unreadCount) return;
    const prev = list;
    setBusy(true);
    setList((cur) => cur.map((n) => ({ ...n, unread: false })));
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setList(prev);
      toast.error(err instanceof Error ? err.message : "Could not mark all as read");
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    const prev = list;
    setList((cur) => cur.map((n) => (n.id === id ? { ...n, unread: false } : n)));
    try {
      await markNotificationRead({ data: { id } });
    } catch (err) {
      setList(prev);
      toast.error(err instanceof Error ? err.message : "Could not update notification");
    }
  }

  async function dismiss(id: string) {
    const prev = list;
    setList((cur) => cur.filter((n) => n.id !== id));
    try {
      await dismissNotification({ data: { id } });
    } catch (err) {
      setList(prev);
      toast.error(err instanceof Error ? err.message : "Could not dismiss notification");
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        eyebrow="Inbox"
        title="Notifications"
        subtitle={`${unreadCount} unread · matches, interviews, offers, and messages in one place.`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => void refresh()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-surface"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button
              onClick={() => void markAll()}
              disabled={busy || !unreadCount}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-surface disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{" "}
              Mark all read
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "match", "interview", "offer", "message", "insight"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
              filter === f
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-muted-foreground hover:bg-surface"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <SectionCard>
        {loadError ? (
          <div className="p-10 text-center">
            <div className="text-sm font-semibold">We couldn't load your notifications</div>
            <div className="mt-1 text-xs text-muted-foreground">{loadError}</div>
            <button
              onClick={() => void refresh()}
              className="mt-4 inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-surface"
            >
              <RefreshCw className="size-3.5" /> Try again
            </button>
          </div>
        ) : loading ? (
          <div className="divide-y divide-border">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-4">
                <div className="size-10 shrink-0 animate-pulse rounded-lg bg-surface" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-surface" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-surface" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((n) => {
              const Icon = iconFor[n.type];
              return (
                <div
                  key={n.id}
                  onClick={() => n.unread && void markOne(n.id)}
                  className={`flex cursor-pointer items-start gap-4 p-4 transition-colors ${
                    n.unread ? "bg-accent/5" : "hover:bg-surface/40"
                  }`}
                >
                  <div
                    className={`grid size-10 shrink-0 place-items-center rounded-lg ${toneFor[n.type]}`}
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold">{n.title}</div>
                      {n.unread && <span className="size-2 rounded-full bg-accent" />}
                    </div>
                    {n.desc && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{n.desc}</div>
                    )}
                    <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                      {n.when}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void dismiss(n.id);
                    }}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <Bell className="mx-auto mb-2 size-6 opacity-40" />
                You're all caught up.
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
