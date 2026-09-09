/**
 * Zajednički deo CLI omotača za lib/maintenance.ts.
 *
 * Skripte u scripts/ više ne nose logiku — ona je u lib/maintenance.ts, da bi
 * je delile sa dugmadima u admin panelu. Ovde ostaje samo ono što je CLI-ju
 * svojstveno: .env.local, WebSocket polyfill, service role klijent i ispis.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { WebSocket } from "ws";
import type { TaskResult } from "../lib/maintenance";

dotenv.config({ path: ".env.local" });
if (!globalThis.WebSocket) {
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = WebSocket;
}

export function cliClient(): SupabaseClient {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY nisu podešeni u .env.local"
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export function printResult(result: TaskResult) {
  for (const line of result.lines) console.log(line);
  for (const w of result.warnings) console.warn(`⚠️  ${w}`);
  console.log(`\n${result.ok ? "🎉" : "⚠️ "} ${result.summary}`);
}

export function runCli(task: (supabase: SupabaseClient) => Promise<TaskResult>) {
  task(cliClient())
    .then((result) => {
      printResult(result);
      if (!result.ok) process.exit(1);
    })
    .catch((err) => {
      console.error(`\n❌ GREŠKA: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    });
}
