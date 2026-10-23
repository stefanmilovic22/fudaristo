"use client";

import { useTranslations } from "next-intl";
import { usePlannerSeen } from "@/lib/planner-seen";

/** Zelena „NOVO" značka — vidljiva dok korisnik nije otvorio planer. */
export function NewBadge({ className = "" }: { className?: string }) {
  const t = useTranslations("planner");
  const seen = usePlannerSeen();
  if (seen !== false) return null;
  return (
    <span
      className={`inline-block bg-[#2FBF71] text-[#06210f] font-extrabold text-[9px] tracking-[0.06em] px-1.5 py-0.5 rounded-full leading-none ${className}`}
    >
      {t("new")}
    </span>
  );
}
