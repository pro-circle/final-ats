import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { NotificationType } from "./notifications.server";

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  desc: string;
  when: string;
  unread: boolean;
};

const TYPES = ["match", "message", "interview", "offer", "insight"] as const;

function relative(iso?: string | null, fallback?: string | null): string {
  if (!iso) return fallback ?? "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return fallback ?? "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

async function ctx() {
  const { requireUserId } = await import("@/lib/session.server");
  const { getSupabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { userId: await requireUserId(), db: getSupabaseAdmin() };
}

export const listNotifications = createServerFn({ method: "GET" }).handler(
  async (): Promise<NotificationItem[]> => {
    const { userId, db } = await ctx();
    if (!db) return [];
    const { data, error } = await db
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[]).map((n) => ({
      id: String(n.id),
      type: (TYPES as readonly string[]).includes(n.type) ? (n.type as NotificationType) : "insight",
      title: n.title ?? "",
      desc: n.body ?? "",
      when: relative(n.created_at, n.time),
      unread: !n.read,
    }));
  },
);

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { userId, db } = await ctx();
    if (!db) return { ok: false };
    const { error } = await db
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean }> => {
    const { userId, db } = await ctx();
    if (!db) return { ok: false };
    const { error } = await db
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw new Error(error.message);
    return { ok: true };
  },
);

export const dismissNotification = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const { userId, db } = await ctx();
    if (!db) return { ok: false };
    const { error } = await db
      .from("notifications")
      .delete()
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
