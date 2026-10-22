"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { invitePath } from "@/lib/leagues";

/** Šifra pozivnice sa dugmadima: kopiraj šifru, kopiraj link, podeli. */
export function InviteCard({ code, leagueName }: { code: string; leagueName: string }) {
  const t = useTranslations("league");
  const locale = useLocale();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const link = () => `${window.location.origin}${invitePath(code, locale)}`;

  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : link());
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // Bez prava pristupa clipboard-u — šifra je ionako ispisana na ekranu.
    }
  }

  async function share() {
    const text = t("shareText", { name: leagueName, code });
    const url = link();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: leagueName, text, url });
        return;
      } catch {
        return; // korisnik je odustao
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener");
  }

  const btn =
    "border border-gold-300 text-gold-300 hover:bg-gold-400/10 rounded-lg px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors";

  return (
    <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
        <h3 className="font-display text-sm uppercase tracking-wider text-gold-300">{t("inviteTitle")}</h3>
      </div>
      <div className="p-4 flex flex-wrap items-center gap-4">
        <div
          className="font-display text-3xl sm:text-4xl font-bold tracking-[0.18em] text-gold-300 bg-navy-950 border border-dashed border-gold-400 rounded-lg px-4 py-1.5 select-all"
          aria-label={t("inviteCode")}
        >
          {code}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => copy("code")} className={btn}>
            {copied === "code" ? t("copied") : t("copyCode")}
          </button>
          <button type="button" onClick={() => copy("link")} className={btn}>
            {copied === "link" ? t("copied") : t("copyLink")}
          </button>
          <button
            type="button"
            onClick={share}
            className="bg-gold-400 text-navy-950 hover:bg-gold-300 rounded-lg px-3.5 py-2 text-sm font-bold whitespace-nowrap transition-colors"
          >
            {t("share")}
          </button>
        </div>
      </div>
    </section>
  );
}
