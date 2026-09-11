import { getSupabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationType = "match" | "message" | "interview" | "offer" | "insight";

/**
 * Writes a notification row for a user. Never throws — a failed notification
 * must not break the action that triggered it.
 */
export async function notify(input: {
  userId: string;
  title: string;
  desc?: string;
  type?: NotificationType;
}): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    if (!db) return;
    const now = new Date();
    await db.from("notifications").insert({
      id: `NTF-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      user_id: input.userId,
      title: input.title,
      body: input.desc ?? "",
      type: input.type ?? "insight",
      time: "Just now",
      read: false,
      created_at: now.toISOString(),
    });
  } catch {
    /* notifications are best-effort */
  }
}
