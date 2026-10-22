import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Praćenje grešaka bez spoljnog servisa: svaki događaj ide u tabelu
 * system_events (admin ih vidi na /admin), a greške usput i na webhook ako je
 * ALERT_WEBHOOK_URL postavljen (Discord, Slack i Telegram-most primaju isti
 * oblik: { content, text }).
 *
 * ⚠️ Nikad ne baca. Praćenje je zadnja stvar koja sme da obori stranicu — ako
 * baza ili webhook ne rade, događaj se samo gubi (ostaje u logu servera).
 */
export type MonitorEvent = {
  level: "error" | "warning" | "info";
  source: string;
  message: string;
  details?: Record<string, unknown>;
};

/** Ista greška (izvor + poruka) se ne beleži ni ne šalje češće od jednom u ovom roku. */
const DEDUPE_MINUTES = 10;

export async function reportEvent(event: MonitorEvent): Promise<void> {
  const message = event.message.slice(0, 500);
  const source = event.source.slice(0, 120);
  try {
    console.error(`[monitor:${event.level}] ${source}: ${message}`);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;

    const supabase = createServiceRoleClient();
    const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    const { count } = await supabase
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .eq("source", source)
      .eq("message", message)
      .gte("created_at", since);
    if ((count ?? 0) > 0) return;

    await supabase.from("system_events").insert({
      level: event.level,
      source,
      message,
      details: truncateDetails(event.details ?? {}),
    });

    if (event.level === "error") await sendAlert(`⚠️ Fudaristo — ${source}\n${message}`);
  } catch (e) {
    console.error("[monitor] nije uspelo:", e instanceof Error ? e.message : e);
  }
}

async function sendAlert(text: string) {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1800), text: text.slice(0, 1800) }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // webhook nedostupan — ne ponavljamo
  }
}

function truncateDetails(d: Record<string, unknown>): Record<string, unknown> {
  try {
    const json = JSON.stringify(d);
    return json.length > 4000 ? { truncated: json.slice(0, 4000) } : d;
  } catch {
    return {};
  }
}

/** Briše događaje starije od 30 dana — zove se iz cron-a, da tabela ne raste u nedogled. */
export async function pruneEvents(): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("system_events")
      .delete()
      .lt("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
  } catch {
    // nije kritično
  }
}
