import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalTime } from "@/components/LocalTime";

/**
 * „Zdravlje sistema": kad je cron poslednji put uspešno radio i poslednje
 * greške servera/pregledača (lib/monitor.ts → system_events, migracija 018).
 * Cron radi dvaput dnevno, pa je više od 30 sati tišine znak da nešto ne radi.
 */
const STALE_HOURS = 30;

export async function SystemHealthPanel({ supabase }: { supabase: SupabaseClient }) {
  const [{ data: lastCron }, { data: events, error: eventsError }] = await Promise.all([
    supabase
      .from("ingestion_runs")
      .select("started_at, finished_at, errors")
      .eq("kind", "cron_results")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("system_events")
      .select("id, created_at, level, source, message")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const ageHours = lastCron ? (Date.now() - new Date(lastCron.started_at).getTime()) / 3_600_000 : null;
  const cronErrors = Array.isArray(lastCron?.errors) ? lastCron!.errors.length : 0;
  const stale = ageHours === null || ageHours > STALE_HOURS;
  const cronOk = !stale && lastCron?.finished_at && cronErrors === 0;

  return (
    <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
        <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">Zdravlje sistema</h3>
      </div>
      <div className="p-4 flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${
              cronOk ? "bg-pitch-400/20 text-pitch-400" : "bg-danger-400/15 text-danger-400"
            }`}
          >
            {cronOk ? "cron OK" : stale ? "cron kasni" : "cron sa greškama"}
          </span>
          <span className="text-slate-300">
            {lastCron ? (
              <>
                Poslednje automatsko povlačenje:{" "}
                <LocalTime iso={lastCron.started_at} options={{ dateStyle: "short", timeStyle: "short" }} /> (pre{" "}
                {Math.round(ageHours!)} h
                {cronErrors > 0 ? `, ${cronErrors} upozorenj(a)` : ""})
              </>
            ) : (
              "Cron još nije pokrenut."
            )}
          </span>
        </div>

        {eventsError ? (
          <p className="text-slate-400">
            Dnevnik grešaka nije dostupan — pokreni migraciju <code>018-sistemski-dogadjaji.sql</code> u Supabase.
          </p>
        ) : (events ?? []).length === 0 ? (
          <p className="text-slate-400">Nema zabeleženih grešaka. 🎉</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events!.map((e: any) => (
              <li key={e.id} className="bg-navy-900/60 rounded-lg px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-slate-400 text-xs w-32 shrink-0">
                  <LocalTime iso={e.created_at} options={{ dateStyle: "short", timeStyle: "short" }} />
                </span>
                <span
                  className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
                    e.level === "error"
                      ? "bg-danger-400/15 text-danger-400"
                      : e.level === "warning"
                        ? "bg-gold-400/15 text-gold-300"
                        : "bg-navy-700 text-slate-300"
                  }`}
                >
                  {e.level}
                </span>
                <span className="text-xs text-slate-400 break-all">{e.source}</span>
                <span className="w-full text-slate-200 break-words">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Alarm na telefon: postavi <code>ALERT_WEBHOOK_URL</code> (Discord/Slack webhook) u Vercel-u.
        </p>
      </div>
    </section>
  );
}
