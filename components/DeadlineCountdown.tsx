"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Odbrojavanje do roka za predaju sastava, na početnoj strani.
 *
 * Server već filtrira na deadline_at > now (lib/gameweek.ts), pa je ovde
 * uvek pozitivan broj u trenutku prvog renderovanja — ali otkucava dalje na
 * klijentu, pa posle nekog vremena na otvorenoj kartici može doći do nule.
 * `remaining <= 0` tad prosto sakriva komponentu umesto da pokaže "-1d".
 */
export function DeadlineCountdown({
  deadlineAt,
  gameweekNumber,
}: {
  deadlineAt: string;
  gameweekNumber: number;
}) {
  const t = useTranslations("home");
  const target = new Date(deadlineAt).getTime();
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(target - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (remaining <= 0) return null;

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const units: { value: number; label: string }[] = [
    { value: days, label: t("countdown.days") },
    { value: hours, label: t("countdown.hours") },
    { value: minutes, label: t("countdown.minutes") },
    { value: seconds, label: t("countdown.seconds") },
  ];

  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-4 py-3 sm:px-5 sm:py-4 inline-flex flex-col gap-2">
      <p className="text-slate-400 text-xs sm:text-sm">
        {t("deadlineLabel", { number: gameweekNumber })}
      </p>
      <div className="flex items-baseline gap-3 sm:gap-4">
        {units.map((u) => (
          <div key={u.label} className="flex items-baseline gap-1">
            <span className="font-display text-2xl sm:text-3xl font-bold text-gold-300 tabular-nums">
              {u.value}
            </span>
            <span className="text-slate-400 text-xs">{u.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
