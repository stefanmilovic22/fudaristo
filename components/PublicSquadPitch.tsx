"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pitch, Bench } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";
import { PlayerPointsBreakdownPopover, type BreakdownGroup } from "@/components/PlayerPointsBreakdownPopover";
import { POSITION_SHORT, type Position } from "@/lib/fantasy-rules";

export type PublicEntry = {
  id: string;
  position: Position;
  firstName: string;
  lastName: string;
  clubName: string;
  short: string;
  color: string;
  /** Prava fotografija dresa kluba (clubs.jersey_photo_url) — null bez fotografije. */
  jerseyPhotoUrl: string | null;
  isCaptain: boolean;
  isViceCaptain: boolean;
  autoSubbedIn: boolean;
  /** Sirovi (nemnoženi) poeni igrača za ovo kolo — isto što stoji u player_gameweek_stats. */
  points: number;
  /** 2 za kapitena, 3 uz Triple Captain, inače 1 — videti resolveCaptainMultiplier. */
  multiplier: number;
  breakdown: BreakdownGroup[];
};

/**
 * Interaktivni teren + klupa za javni pregled tuđeg tima.
 *
 * Klijentska komponenta samo zbog stanja "koji je prozorčić otvoren" — klik
 * na igrača otvara raspis poena (koji, po čemu, videti
 * PlayerPointsBreakdownPopover). Klupa NIJE zatamnjena (nema `dimmed` — ranije
 * je svaki igrač na klupi imao `muted`, pa je delovala kao onemogućena), i
 * ima oznaku pozicije + golman prvi (isti raspored kao "Moj klub").
 */
export function PublicSquadPitch({
  rows,
  benchGk,
  bench,
  autoSubLabel,
}: {
  rows: PublicEntry[][];
  benchGk: PublicEntry | null;
  bench: PublicEntry[];
  autoSubLabel: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <>
      <Pitch>
        <div className="flex flex-col justify-between h-full gap-3 xs:gap-4 sm:gap-6 py-1 sm:py-2">
          {rows.map((line, i) => (
            <div key={i} className="flex justify-center gap-2 sm:gap-4 flex-wrap">
              {line.map((e) => (
                <EntrySlot
                  key={e.id}
                  entry={e}
                  open={openId === e.id}
                  onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))}
                  autoSubLabel={autoSubLabel}
                />
              ))}
            </div>
          ))}
        </div>
      </Pitch>

      <Bench
        goalkeeper={
          benchGk ? (
            <EntrySlot
              entry={benchGk}
              open={openId === benchGk.id}
              onToggle={() => setOpenId((cur) => (cur === benchGk.id ? null : benchGk.id))}
              autoSubLabel={autoSubLabel}
              positionLabel={POSITION_SHORT.GK}
            />
          ) : undefined
        }
      >
        {bench.map((e, i) => (
          <EntrySlot
            key={e.id}
            entry={e}
            open={openId === e.id}
            onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))}
            autoSubLabel={autoSubLabel}
            positionLabel={`${i + 1} · ${POSITION_SHORT[e.position]}`}
          />
        ))}
      </Bench>
    </>
  );
}

function EntrySlot({
  entry,
  open,
  onToggle,
  autoSubLabel,
  positionLabel,
}: {
  entry: PublicEntry;
  open: boolean;
  onToggle: () => void;
  autoSubLabel: string;
  positionLabel?: string;
}) {
  const t = useTranslations("playerInfo");
  const anchorRef = useRef<HTMLDivElement>(null);
  // Prikazani broj MORA da odražava kapitensku traku — inače bi ukupan zbir
  // tima (koji množilac uračunava) delovao kao da se "sam od sebe" povećao,
  // dok bi pojedinačni igrač i dalje pokazivao sirovih 9 umesto 27.
  const displayPoints = entry.points * entry.multiplier;
  const multiplierLabel =
    entry.multiplier === 3 ? t("tripleX3") : entry.multiplier === 2 ? t("captainX2") : null;

  return (
    <div ref={anchorRef} className="relative">
      <Jersey
        color={entry.color}
        photoUrl={entry.jerseyPhotoUrl}
        name={entry.lastName || entry.firstName}
        detail={`${displayPoints}`}
        initials={entry.short}
        isCaptain={entry.isCaptain}
        isViceCaptain={entry.isViceCaptain}
        flag={entry.autoSubbedIn ? autoSubLabel : null}
        positionLabel={positionLabel}
        onClick={onToggle}
      />
      {open && (
        <PlayerPointsBreakdownPopover
          anchorRef={anchorRef}
          player={{
            first_name: entry.firstName,
            last_name: entry.lastName,
            club_name: entry.clubName,
            club_color: entry.color,
            position: entry.position,
          }}
          groups={entry.breakdown}
          total={entry.points}
          multiplier={entry.multiplier}
          multiplierLabel={multiplierLabel}
          onClose={onToggle}
        />
      )}
    </div>
  );
}
