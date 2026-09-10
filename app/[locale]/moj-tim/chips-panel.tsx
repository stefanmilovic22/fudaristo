"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export type ChipType = "joker_1" | "joker_2" | "triple_captain" | "favorite_club_x2";

export type ChipState = {
  type: ChipType;
  /** Broj kola u kom je čip iskorišćen, ili null ako je još slobodan. */
  usedInGameweek: number | null;
  /** Da li je aktivan baš u kolu koje se trenutno uređuje. */
  activeNow: boolean;
  /** Za jokere: da li je ovo kolo njihov prozor. Za ostale uvek true. */
  availableThisGameweek: boolean;
};

/**
 * Znak i oznaka efekta ostaju u kodu — nisu tekst nego simboli, isti su na
 * svim jezicima. Naziv i opis idu kroz prevod.
 */
const CHIP_VISUAL: Record<ChipType, { effect: string; glyph: string; nameKey: string; blurbKey: string }> = {
  triple_captain: { effect: "3×", glyph: "C", nameKey: "tripleCaptainName", blurbKey: "tripleCaptainBlurb" },
  favorite_club_x2: { effect: "2×", glyph: "★", nameKey: "favoriteClubName", blurbKey: "favoriteClubBlurb" },
  joker_1: { effect: "∞", glyph: "↺", nameKey: "joker1Name", blurbKey: "joker1Blurb" },
  joker_2: { effect: "∞", glyph: "↺", nameKey: "joker2Name", blurbKey: "joker2Blurb" },
};

const ORDER: ChipType[] = ["triple_captain", "favorite_club_x2", "joker_1", "joker_2"];

/**
 * Čipovi za kolo koje se trenutno uređuje.
 *
 * Sva pravila (rok, jednom po sezoni, jedan po kolu, joker samo u svom
 * prozoru) proverava `activate_chip()` u bazi. Ovde se ista pravila samo
 * PRIKAZUJU unapred — dugme koje ne može da uspe je onemogućeno sa
 * objašnjenjem, umesto da korisnik klikne pa dobije grešku.
 *
 * Otkazivanje Jokera posle napravljenog transfera baza odbija; UI to ne zna
 * unapred (ne čita transfere), pa se poruka prikazuje kad stigne.
 */
export function ChipsPanel({
  gameweekId,
  gameweekNumber,
  chips,
  favoriteClubName,
}: {
  gameweekId: string;
  gameweekNumber: number;
  chips: ChipState[];
  favoriteClubName: string | null;
}) {
  const t = useTranslations("chips");
  const router = useRouter();
  const supabase = createClient();
  const [working, setWorking] = useState<ChipType | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeChip = chips.find((c) => c.activeNow) ?? null;

  async function activate(chip: ChipType) {
    setWorking(chip);
    setError(null);
    const { error: rpcError } = await supabase.rpc("activate_chip", {
      p_gameweek_id: gameweekId,
      p_chip: chip,
    });
    setWorking(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  async function cancel() {
    setWorking("cancel");
    setError(null);
    const { error: rpcError } = await supabase.rpc("cancel_chip", {
      p_gameweek_id: gameweekId,
    });
    setWorking(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="font-display text-lg leading-none">{t("title")}</h3>
          <p className="text-xs text-slate-500 mt-1">{t("rule")}</p>
        </div>
        <span
          className={`text-xs font-semibold rounded-full px-3 py-1 ${
            activeChip
              ? "bg-gold-400 text-navy-950"
              : "bg-navy-700 text-slate-400"
          }`}
        >
          {activeChip
            ? t("badgeWith", {
                number: gameweekNumber,
                chip: t(CHIP_VISUAL[activeChip.type].nameKey as never),
              })
            : t("badgeNone", { number: gameweekNumber })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((type) => {
          const chip = chips.find((c) => c.type === type);
          if (!chip) return null;
          const visual = CHIP_VISUAL[type];
          const chipName = t(visual.nameKey as never);

          const spent = chip.usedInGameweek !== null && !chip.activeNow;
          const blockedByOther = activeChip !== null && !chip.activeNow;
          const outOfWindow = !chip.availableThisGameweek;
          const needsFavorite = type === "favorite_club_x2" && !favoriteClubName;

          let reason: string | null = null;
          if (spent) reason = t("spent", { number: chip.usedInGameweek! });
          else if (outOfWindow) reason = t("locked");
          else if (needsFavorite) reason = t("needsFavorite");
          else if (blockedByOther)
            reason = t("blockedByOther", {
              chip: t(CHIP_VISUAL[activeChip!.type].nameKey as never),
            });

          const usable = !reason && !chip.activeNow;

          return (
            <div
              key={type}
              className={`relative rounded-xl border overflow-hidden flex flex-col transition-colors ${
                chip.activeNow
                  ? "border-gold-400 bg-navy-700"
                  : usable
                    ? "border-navy-600 bg-navy-800 hover:border-slate-500"
                    : "border-navy-700 bg-navy-800/50"
              }`}
            >
              {/* Zlatna traka uz ivicu je jedini element koji se vidi iz ugla
                  oka — stanje čipa se čita bez čitanja teksta. */}
              {chip.activeNow && <span className="absolute inset-y-0 left-0 w-1 bg-gold-400" />}

              <div className={`flex items-start gap-3 p-4 ${reason ? "opacity-45" : ""}`}>
                <span
                  className={`shrink-0 w-11 h-11 rounded-lg grid place-items-center font-display font-bold text-lg ${
                    chip.activeNow
                      ? "bg-gold-400 text-navy-950"
                      : "bg-navy-900 text-slate-300"
                  }`}
                  aria-hidden
                >
                  {visual.glyph}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-sm truncate">{chipName}</span>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        chip.activeNow ? "text-gold-300" : "text-slate-400"
                      }`}
                    >
                      {visual.effect}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed mt-1">
                    {t(visual.blurbKey as never)}
                    {type === "favorite_club_x2" && favoriteClubName && (
                      <span className="text-slate-300"> ({favoriteClubName})</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-auto border-t border-navy-700 px-4 py-2.5 flex items-center justify-between gap-2 min-h-[44px]">
                {chip.activeNow ? (
                  <>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-gold-300">
                      {t("active")}
                    </span>
                    <button
                      type="button"
                      onClick={cancel}
                      disabled={working !== null}
                      className="text-xs font-semibold text-slate-400 hover:text-danger-400 transition-colors disabled:opacity-50"
                    >
                      {working === "cancel" ? t("cancelling") : t("cancel")}
                    </button>
                  </>
                ) : reason ? (
                  <span className="text-[11px] text-slate-500">{reason}</span>
                ) : (
                  <>
                    <span className="text-[11px] text-slate-500">{t("free")}</span>
                    <button
                      type="button"
                      onClick={() => activate(type)}
                      disabled={working !== null}
                      className="text-xs font-bold bg-gold-400 text-navy-950 rounded-md px-3 py-1.5 hover:bg-gold-300 transition-colors disabled:opacity-50"
                    >
                      {working === type ? t("activating") : t("activate")}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-danger-400 text-sm mt-4">{error}</p>}
    </div>
  );
}
