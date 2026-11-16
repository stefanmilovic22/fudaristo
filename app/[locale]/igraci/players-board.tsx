"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { POSITIONS, type Position } from "@/lib/fantasy-rules";
import { ClubBadge } from "@/components/ClubBadge";
import { PlayerLine, PlayerLineHeader, type PlayerLineData } from "@/components/PlayerLine";
import { PlayerInfoPopover, type UpcomingFixture } from "@/components/PlayerInfoPopover";
import { WatchStar } from "@/components/WatchStar";
import { useWatchlist } from "@/lib/use-watchlist";

export type BoardPlayer = PlayerLineData & { id: string };
export type BoardClub = {
  id: string;
  name: string;
  short: string;
  color: string;
  jerseyPhoto: string | null;
  players: BoardPlayer[];
};

/** Bez dijakritika i velikih slova — „Jović” se nalazi i kao „jovic”. */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PlayersBoard({
  clubs,
  upcomingByClub,
  userId = null,
  watchedIds = [],
}: {
  clubs: BoardClub[];
  upcomingByClub: Record<string, UpcomingFixture[]>;
  /** Prijavljen korisnik — bez njega nema zvezdica ni filtera „Praćeni“. */
  userId?: string | null;
  watchedIds?: string[];
}) {
  const t = useTranslations("players");
  const tPicker = useTranslations("picker");
  const tPos = useTranslations("positions");

  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "ALL">("ALL");
  const [onlyWatched, setOnlyWatched] = useState(false);
  const [selected, setSelected] = useState<{ player: BoardPlayer; club: BoardClub } | null>(null);
  const { watched, toggle, busy, error, clearError } = useWatchlist(userId, watchedIds);
  const anchor = useRef<HTMLElement | null>(null);

  const statusLabel = (s: string) => (s === "available" ? null : t(`status_${s}` as "status_injured"));

  const filtering = query.trim() !== "" || position !== "ALL" || onlyWatched;
  const groups = useMemo(() => {
    const q = norm(query.trim());
    return clubs
      .map((c) => ({
        club: c,
        players: c.players.filter(
          (p) =>
            (position === "ALL" || p.position === position) &&
            (!onlyWatched || watched.has(p.id)) &&
            (q === "" || norm(`${p.first_name} ${p.last_name}`).includes(q) || norm(c.name).includes(q))
        ),
      }))
      .filter((g) => g.players.length > 0);
  }, [clubs, query, position, onlyWatched, watched]);

  const total = groups.reduce((n, g) => n + g.players.length, 0);

  return (
    <div className="max-w-3xl">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tPicker("search")}
        className="w-full bg-navy-800 border border-navy-700 rounded-xl px-4 py-3 text-base outline-none focus:border-gold-400"
      />

      <div className="flex flex-wrap gap-1.5 mt-3">
        {(["ALL", ...POSITIONS] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPosition(p)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              position === p ? "bg-gold-400 text-navy-950" : "bg-navy-800 text-slate-300 hover:text-chalk-50"
            }`}
          >
            {p === "ALL" ? tPicker("allPositions") : tPos(p)}
          </button>
        ))}
      </div>

      {userId && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOnlyWatched((v) => !v)}
            aria-pressed={onlyWatched}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              onlyWatched ? "bg-gold-400 text-navy-950" : "bg-navy-800 text-slate-300 hover:text-chalk-50"
            }`}
          >
            <span aria-hidden>★</span>
            {t("watchedFilter", { count: watched.size })}
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-danger-400" role="alert" onClick={clearError}>
          {error === "full" ? t("watchFull") : t("watchFailed")}
        </p>
      )}

      <p className="text-xs text-slate-500 mt-3 mb-3">{tPicker("count", { count: total })}</p>

      {groups.length === 0 && (
        <p className="text-sm text-slate-400">{onlyWatched ? t("watchedEmpty") : tPicker("noMatch")}</p>
      )}

      <div className="flex flex-col gap-2">
        {groups.map(({ club, players }) => (
          <details
            key={club.id}
            // Dok se traži/filtrira, sve grupe sa rezultatima su otvorene.
            open={filtering || undefined}
            className="group bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden"
          >
            <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden bg-navy-700/60 hover:bg-navy-700">
              <ClubBadge short={club.short} color={club.color} size={32} />
              <span className="font-display text-lg flex-1 min-w-0 truncate">{club.name}</span>
              <span className="text-xs text-slate-400 shrink-0">{tPicker("count", { count: players.length })}</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>

            <PlayerLineHeader
              hasPos
              hasJersey
              hideJerseyOnNarrow
              price={t("colPrice")}
              points={t("colPoints")}
              rating={t("colRating")}
            />
            <ul className="divide-y divide-navy-700 mt-1 border-t border-navy-700">
              {players.map((p) => (
                <li key={p.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={(e) => {
                      anchor.current = e.currentTarget;
                      setSelected({ player: p, club });
                    }}
                    className={`flex-1 min-w-0 text-left pl-3 xs:pl-4 sm:pl-5 ${userId ? "pr-0" : "pr-3 xs:pr-4 sm:pr-5"} py-2.5 text-sm hover:bg-navy-700/40 transition-colors`}
                  >
                    <PlayerLine
                      player={p}
                      posLabel={tPos(`short${p.position}`)}
                      statusLabel={statusLabel(p.status)}
                      jersey={{ color: club.color, photoUrl: club.jerseyPhoto }}
                      hideJerseyOnNarrow
                    />
                  </button>
                  {userId && (
                    <span className="self-center pr-1 sm:pr-2">
                      <WatchStar
                        watched={watched.has(p.id)}
                        disabled={busy.has(p.id)}
                        onToggle={() => toggle(p.id)}
                        label={watched.has(p.id) ? t("unwatch") : t("watch")}
                      />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      {selected && (
        <PlayerInfoPopover
          anchorRef={anchor}
          player={{
            id: selected.player.id,
            first_name: selected.player.first_name,
            last_name: selected.player.last_name,
            club_name: selected.club.name,
            club_color: selected.club.color,
            position: selected.player.position,
            total_points: selected.player.total_points,
            avg_rating: selected.player.avg_rating,
          }}
          fixtures={upcomingByClub[selected.club.id] ?? []}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
