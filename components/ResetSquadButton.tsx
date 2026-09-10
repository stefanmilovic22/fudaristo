"use client";

import { useTranslations } from "next-intl";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Prazni sačuvan tim i vraća budžet, pa korisnik može da gradi ispočetka.
 * Prikazuje se samo pre prvog roka — posle toga izmene idu kroz transfere,
 * i sama funkcija u bazi to odbija bez obzira na to šta UI prikazuje.
 */
export function ResetSquadButton({ gameweekId }: { gameweekId: string }) {
  const t = useTranslations("reset");
  const router = useRouter();
  const supabase = createClient();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setWorking(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("reset_squad", {
      p_gameweek_id: gameweekId,
    });
    if (rpcError) {
      setError(rpcError.message);
      setWorking(false);
      return;
    }
    setConfirming(false);
    setWorking(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="border border-navy-600 text-slate-300 font-semibold text-sm px-3 py-2 rounded-lg hover:border-danger-400 hover:text-danger-400 transition-colors"
      >
        Isprazni tim
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-slate-300">{t("confirmClear")}</span>
      <button
        type="button"
        onClick={reset}
        disabled={working}
        className="bg-danger-400 text-chalk-50 font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
      >
        {working ? "Praznim…" : "Da, isprazni"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-slate-300 px-2 py-1.5 hover:text-chalk-50"
      >
        Odustani
      </button>
      {error && <span className="text-danger-400 text-xs">{error}</span>}
    </span>
  );
}
