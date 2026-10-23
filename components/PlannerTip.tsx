"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SwapIcon } from "@/components/icons";
import { hidePlannerTip, usePlannerSeen, usePlannerTipHidden } from "@/lib/planner-seen";

/**
 * Tanka traka iznad čipova na „Moj klub": skreće pažnju na planer. Nestaje kad
 * je korisnik zatvori ili kad jednom otvori planer (pamti se u pregledaču).
 */
export function PlannerTip() {
  const t = useTranslations("planner");
  const hidden = usePlannerTipHidden();
  const seen = usePlannerSeen();
  if (hidden !== false || seen !== false) return null;

  return (
    <div className="flex items-center gap-2.5 sm:gap-3 rounded-xl border border-gold-400/40 bg-gradient-to-r from-gold-400/15 to-gold-400/[0.03] px-3 sm:px-4 py-2.5 text-[13px] sm:text-sm text-slate-200">
      <span className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-gold-400 to-[#3E86F0] text-navy-950 grid place-items-center">
        <SwapIcon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">{t("tipText")}</span>
      <Link href="/planer" className="shrink-0 font-bold text-gold-300 hover:underline whitespace-nowrap">
        {t("tipOpen")} →
      </Link>
      <button
        type="button"
        onClick={hidePlannerTip}
        aria-label={t("close")}
        className="shrink-0 text-slate-400 hover:text-chalk-50 text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
