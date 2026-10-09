"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { intlTag } from "@/lib/intl-locale";

/**
 * Vreme prikazano u vremenskoj zoni POSETIOCA — u Srbiji srpsko, u Grčkoj
 * grčko vreme. Termini su u bazi u UTC-u; server ne zna gde je posetilac, pa
 * se konačno vreme računa tek u pregledaču.
 *
 * Prvi prikaz je u grčkom vremenu i odmah po učitavanju se menja u lokalno
 * vreme posetioca (videti komentar kod `suppressHydrationWarning`).
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
  const [local, setLocal] = useState(false);
  useEffect(() => {
    setText(format());
    setLocal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, locale, optionsKey]);

  // suppressHydrationWarning: server (Node) i pregledač imaju različite ICU
  // podatke, pa isto vreme ume da se napiše drugačije ("10. 10. 2026." naspram
  // "10.10.26."). Prvi prikaz je samo privremen; čim se učita, `key` menja
  // element i upisuje se vreme formatirano u pregledaču.
  return (
    <time key={local ? "local" : "initial"} dateTime={iso} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}
