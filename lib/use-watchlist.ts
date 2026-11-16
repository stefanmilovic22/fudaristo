"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Lista praćenih igrača (tabela player_watchlist, migracija 023).
 *
 * Upisuje se direktno iz pregledača: RLS dozvoljava svakome samo SOPSTVENE
 * redove, a gornju granicu (50) čuva okidač u bazi. Ažuriranje je odmah vidljivo
 * (optimistično) i vraća se nazad ako baza odbije.
 */
export type WatchError = "full" | "failed";

export function useWatchlist(userId: string | null, initialIds: string[]) {
  const [watched, setWatched] = useState<Set<string>>(() => new Set(initialIds));
  const [busy, setBusy] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<WatchError | null>(null);

  const toggle = useCallback(
    async (playerId: string) => {
      if (!userId || busy.has(playerId)) return;
      const wasWatched = watched.has(playerId);
      setError(null);
      setBusy((b) => new Set(b).add(playerId));
      setWatched((w) => {
        const next = new Set(w);
        if (wasWatched) next.delete(playerId);
        else next.add(playerId);
        return next;
      });

      const supabase = createClient();
      const { error: dbError } = wasWatched
        ? await supabase.from("player_watchlist").delete().eq("user_id", userId).eq("player_id", playerId)
        : await supabase.from("player_watchlist").insert({ user_id: userId, player_id: playerId });

      // Već praćen igrač (dupli klik iz dve kartice) nije greška — stanje je traženo.
      if (dbError && dbError.code !== "23505") {
        setWatched((w) => {
          const next = new Set(w);
          if (wasWatched) next.add(playerId);
          else next.delete(playerId);
          return next;
        });
        setError(dbError.message.includes("watchlist_full") ? "full" : "failed");
      }
      setBusy((b) => {
        const next = new Set(b);
        next.delete(playerId);
        return next;
      });
    },
    [userId, busy, watched]
  );

  return { watched, toggle, busy, error, clearError: () => setError(null) };
}
