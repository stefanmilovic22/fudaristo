"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { intlTag } from "@/lib/intl-locale";

/**
 * Vreme prikazano u vremenskoj zoni POSETIOCA — u Srbiji srpsko, u Grčkoj
 * grčko vreme. Termini su u bazi u UTC-u; server ne zna gde je posetilac, pa
 * se konačno vreme računa tek u pregledaču.
 *
 * Prvi prikaz (server + prvi render u pregledaču) je u grčkom vremenu —
 * identičan na obe strane, pa nema greške pri hidrataciji — i odmah po
 * učitavanju se menja u lokalno vreme posetioca.
 */
const FALLBACK_TZ = "Europe/Athens";

export function LocalTime({
  iso,
  options,
  className,
}: {
  iso: string;
  options: Intl.DateTimeFormatOptions;
  className?: string;
}) {
  const locale = useLocale();
  const optionsKey = JSON.stringify(options);

  const format = (timeZone?: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(intlTag(locale), { ...options, timeZone }).format(d);
  };

  const [text, setText] = useState(() => format(FALLBACK_TZ));
  useEffect(() => {
    setText(format());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, locale, optionsKey]);

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
