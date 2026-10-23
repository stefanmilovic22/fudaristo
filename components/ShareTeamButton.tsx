"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { teamPath } from "@/lib/share";
import { ACTION_ICON, actionClass } from "@/components/action-styles";
import { ShareIcon } from "@/components/icons";

/**
 * „Podeli tim": traži sliku postave sa servera (/api/tim/[id]/slika) i na
 * telefonu otvara sistemski meni za deljenje (WhatsApp, Viber, Instagram…) sa
 * slikom i linkom; gde to ne postoji (računar), preuzima PNG.
 */
export function ShareTeamButton({
  userId,
  teamName,
  totalPoints,
  mode,
  className = "",
}: {
  userId: string;
  teamName: string;
  totalPoints: number;
  /** "current": sastav za naredno kolo bez poena (Moj klub). Bez toga: poslednje zaključano kolo sa poenima. */
  mode?: "current";
  className?: string;
}) {
  const t = useTranslations("shareTeam");
  const tActions = useTranslations("actions");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/tim/${userId}/slika?lang=${locale}${mode === "current" ? "&mode=current" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const file = new File([blob], "fudaristo-tim.png", { type: "image/png" });
      const url = `${window.location.origin}${teamPath(userId, locale)}`;
      const text =
        mode === "current" ? t("textCurrent", { team: teamName }) : t("text", { team: teamName, points: totalPoints });

      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text, url });
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) throw e; // korisnik je odustao
        }
        return;
      }

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex flex-col items-stretch sm:items-start">
      <button type="button" onClick={share} disabled={busy} className={`${actionClass("primary")} ${className}`}>
        <ShareIcon className={ACTION_ICON} />
        <span className="sm:hidden">{busy ? t("busyShort") : tActions("shareShort")}</span>
        <span className="hidden sm:inline">{busy ? t("busy") : t("button")}</span>
      </button>
      {failed && <span role="alert" className="text-danger-400 text-xs mt-1 max-w-[220px]">{t("error")}</span>}
    </span>
  );
}
