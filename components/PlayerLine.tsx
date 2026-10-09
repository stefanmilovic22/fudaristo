import { playerFullName, type Position } from "@/lib/fantasy-rules";
import { JerseyIcon } from "@/components/JerseyIcon";

export type PlayerLineData = {
  first_name: string;
  last_name: string;
  position: Position;
  price: number;
  status: string;
  total_points: number;
  avg_rating: number | null;
};

/** Boja oznake statusa: povreda/suspenzija crveno, neizvesno zlatno. */
const STATUS_STYLE: Record<string, string> = {
  injured: "bg-danger-400/15 text-danger-400",
  suspended: "bg-danger-400/15 text-danger-400",
  unavailable: "bg-danger-400/15 text-danger-400",
  doubtful: "bg-gold-400/15 text-gold-300",
};

/**
 * Sadržaj jednog reda igrača: [pozicija] ime [status] · cena · poeni · ocena.
 * Bez logike i bez prevoda (oznake dolaze spolja), pa radi i u serverskim i u
 * klijentskim komponentama.
 */
export function PlayerLine({
  player,
  posLabel,
  statusLabel,
  jersey,
}: {
  player: PlayerLineData;
  /** Dres kluba pored imena (boja i, ako postoji, fotografija). */
  jersey?: { color: string; photoUrl?: string | null };
  /** Skraćenica pozicije; izostavljeno kad su igrači već grupisani po poziciji. */
  posLabel?: string;
  /** Prevedena oznaka statusa; null kad je igrač dostupan. */
  statusLabel: string | null;
}) {
  return (
    <span className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
      {posLabel && (
        <span className="shrink-0 w-9 text-center text-[10px] font-bold tracking-wide text-navy-950 bg-slate-300 rounded-full px-1 py-0.5">
          {posLabel}
        </span>
      )}
      {jersey && (
        <span className="shrink-0 w-[30px] grid place-items-center">
          <JerseyIcon
            color={jersey.color}
            photoUrl={jersey.photoUrl}
            isGoalkeeper={player.position === "GK"}
            size={28}
          />
        </span>
      )}
      <span className="flex-1 min-w-0 flex flex-col items-start sm:flex-row sm:items-center sm:gap-2">
        <span className="max-w-full truncate font-semibold">{playerFullName(player)}</span>
        {statusLabel && (
          <span
            className={`shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${
              STATUS_STYLE[player.status] ?? "bg-navy-700 text-slate-300"
            }`}
          >
            {statusLabel}
          </span>
        )}
      </span>
      <span className="shrink-0 w-14 text-right tabular-nums text-slate-300 text-sm">
        {Number(player.price).toFixed(1)}M
      </span>
      <span className="shrink-0 w-9 text-right tabular-nums font-bold text-gold-300 text-sm">
        {player.total_points}
      </span>
      <span className="shrink-0 w-9 text-right tabular-nums text-slate-400 text-sm hidden xs:inline-block">
        {player.avg_rating != null ? player.avg_rating.toFixed(1) : "–"}
      </span>
    </span>
  );
}

/** Zaglavlje kolona koje odgovara PlayerLine-u (cena / poeni / ocena). */
export function PlayerLineHeader({
  price,
  points,
  rating,
  hasPos,
  hasJersey,
}: {
  price: string;
  points: string;
  rating: string;
  hasPos?: boolean;
  hasJersey?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-5 pt-3 text-[10px] uppercase tracking-wide text-slate-500">
      {hasPos && <span className="shrink-0 w-9" />}
      {hasJersey && <span className="shrink-0 w-[30px]" />}
      <span className="flex-1" />
      <span className="shrink-0 w-14 text-right">{price}</span>
      <span className="shrink-0 w-9 text-right">{points}</span>
      <span className="shrink-0 w-9 text-right hidden xs:inline-block">{rating}</span>
    </div>
  );
}
