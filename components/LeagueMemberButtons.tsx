"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/** „Napusti ligu“ na stranici lige (sa potvrdom). */
export function LeaveLeagueButton({ leagueId }: { leagueId: string }) {
  const t = useTranslations("league");
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!window.confirm(t("leaveConfirm"))) return;
    setBusy(true);
    const { data } = await supabase.rpc("leave_league", { p_league_id: leagueId });
    if (data?.ok) {
      router.push("/liga?tab=moje");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={leave} disabled={busy} className="text-sm text-danger-400 hover:underline disabled:opacity-50">
      {t("leave")}
    </button>
  );
}

/** „Pridruži se ligi“ na stranici poziva. */
export function JoinInviteButton({ code }: { code: string }) {
  const t = useTranslations("league");
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    const { data } = await supabase.rpc("join_league", { p_code: code });
    if (data?.ok) {
      router.push(`/liga/${data.id}`);
      router.refresh();
      return;
    }
    setError(data?.reason === "full" ? t("errFull") : data?.reason === "not_found" ? t("errNotFound") : t("errGeneric"));
    setBusy(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={join}
        disabled={busy}
        className="w-full bg-gold-400 text-navy-950 font-bold rounded-lg px-4 py-3 hover:bg-gold-300 transition-colors disabled:opacity-50"
      >
        {busy ? t("joining") : t("joinThisLeague")}
      </button>
      {error && <p className="text-sm text-danger-400 mt-2">{error}</p>}
    </div>
  );
}
