"use client";

import { useTranslations } from "next-intl";
import { humanizeReason, reasonKey } from "./injury-reasons";

/** Prevedena vrsta povrede/suspenzije; nepoznata se prikazuje čitljivo na engleskom. */
export function useInjuryReason(): (raw: string | null) => string | null {
  const t = useTranslations("injuryReasons");
  return (raw) => {
    if (!raw) return null;
    const key = reasonKey(raw);
    return key && t.has(key as never) ? t(key as never) : humanizeReason(raw);
  };
}
