"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

const CHIP_META: Record<ChipType, { name: string; blurb: string }> = {
  triple_captain: {
    name: "Triple Captain",
    blurb: "Kapiten nosi 3x umesto 2x poena u ovom kolu.",
  },
  favorite_club_x2: {
    name: "Favorite Club x2",
    blurb: "Svi igrači tvog omiljenog kluba nose duple poene u ovom kolu.",
  },
  joker_1: {
    name: "Joker #1",
    blurb: "Neograničeni transferi bez penala. Otvoren samo u zimskoj pauzi.",
  },
  joker_2: {
    name: "Joker #2",
    blurb: "Neograničeni transferi bez penala. Otvoren samo pred plej-of.",
  },
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
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h3 className="font-display text-lg">Čipovi</h3>
        <span className="text-xs text-slate-500">
          Jedan po kolu · svaki jednom u sezoni
        </span>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        {activeChip
          ? `U ${gameweekNumber}. kolu je aktivan ${CHIP_META[activeChip.type].name}.`
          : `Nijedan čip nije aktivan u ${gameweekNumber}. kolu.`}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((type) => {
          const chip = chips.find((c) => c.type === type);
          if (!chip) return null;
          const meta = CHIP_META[type];

          const spent = chip.usedInGameweek !== null && !chip.activeNow;
          const blockedByOther = activeChip !== null && !chip.activeNow;
          const outOfWindow = !chip.availableThisGameweek;
          const needsFavorite = type === "favorite_club_x2" && !favoriteClubName;

          let reason: string | null = null;
          if (spent) reason = `Iskorišćen u ${chip.usedInGameweek}. kolu.`;
          else if (outOfWindow) reason = "Nije otvoren u ovom kolu.";
          else if (needsFavorite) reason = "Prvo izaberi omiljeni klub u podešavanjima.";
          else if (blockedByOther)
            reason = `Već je aktivan ${CHIP_META[activeChip!.type].name}.`;

          return (
            <div
              key={type}
              className={`rounded-lg border p-4 flex flex-col gap-2 ${
                chip.activeNow
                  ? "border-gold-400 bg-navy-700"
                  : reason
                    ? "border-navy-700 opacity-60"
                    : "border-navy-600"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-display text-sm">{meta.name}</span>
                {chip.activeNow && (
                  <span className="text-[10px] uppercase tracking-wide font-bold bg-gold-400 text-navy-950 px-1.5 py-0.5 rounded">
                    aktivan
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {meta.blurb}
                {type === "favorite_club_x2" && favoriteClubName && (
                  <span className="text-slate-300"> Tvoj klub: {favoriteClubName}.</span>
                )}
              </p>

              {chip.activeNow ? (
                <button
                  type="button"
                  onClick={cancel}
                  disabled={working !== null}
                  className="mt-auto text-sm font-semibold text-slate-300 border border-navy-600 rounded-lg px-3 py-1.5 hover:border-danger-400 hover:text-danger-400 transition-colors disabled:opacity-50"
                >
                  {working === "cancel" ? "Otkazujem…" : "Otkaži"}
                </button>
              ) : reason ? (
                <span className="mt-auto text-xs text-slate-500">{reason}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => activate(type)}
                  disabled={working !== null}
                  className="mt-auto text-sm font-bold bg-gold-400 text-navy-950 rounded-lg px-3 py-1.5 hover:bg-gold-300 transition-colors disabled:opacity-50"
                >
                  {working === type ? "Aktiviram…" : "Aktiviraj"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="text-danger-400 text-sm mt-4">{error}</p>}
    </div>
  );
}
