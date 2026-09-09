import Link from "next/link";
import { Bench, Pitch, PitchRow } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";
import { POSITIONS, formatEUR, type Position } from "@/lib/fantasy-rules";

type SquadRow = {
  player_id: string;
  is_starting: boolean;
  squad_order: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  purchase_price: number;
  players: {
    id: string;
    first_name: string;
    last_name: string;
    position: Position;
    price: number;
    status: string;
    club_id: string;
    clubs: { name: string; primary_color: string } | null;
  };
};

export function PitchView({
  squadRows,
  budgetRemaining,
  freeTransfers,
  gameweekNumber,
  deadlineAt,
}: {
  squadRows: SquadRow[];
  budgetRemaining: number;
  freeTransfers: number;
  gameweekNumber: number;
  deadlineAt: string;
}) {
  const starting = squadRows.filter((r) => r.is_starting);
  const bench = [...squadRows.filter((r) => !r.is_starting)].sort(
    (a, b) => a.squad_order - b.squad_order
  );

  const squadValue = squadRows.reduce((sum, r) => sum + Number(r.purchase_price), 0);
  const formation = POSITIONS.slice(1)
    .map((pos) => starting.filter((r) => r.players.position === pos).length)
    .join("-");

  // Golman gore, napadači dole — isti raspored kao na FPL terenu.
  const rows = POSITIONS
    .map((pos) => starting.filter((r) => r.players.position === pos))
    .filter((row) => row.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <Stat label="Kolo" value={String(gameweekNumber)} />
        <Stat label="Rok" value={new Date(deadlineAt).toLocaleString("sr-RS")} />
        <Stat label="Vrednost tima" value={formatEUR(squadValue)} />
        <Stat label="U kasi" value={formatEUR(budgetRemaining)} />
        <Stat label="Slobodni transferi" value={String(freeTransfers)} />
        <Link
          href="/transferi"
          className="bg-gold-400 text-navy-950 font-bold px-4 py-2 rounded-lg ml-auto hover:bg-gold-300 transition-colors"
        >
          Napravi transfer
        </Link>
      </div>

      <Pitch>
        <div className="flex flex-col gap-5 sm:gap-7">
          {rows.map((row, i) => (
            <PitchRow key={i}>
              {row.map((r) => (
                <PlayerJersey key={r.player_id} row={r} />
              ))}
            </PitchRow>
          ))}
        </div>
      </Pitch>

      <Bench note={`Formacija ${formation}`}>
        {bench.map((r) => (
          <PlayerJersey key={r.player_id} row={r} />
        ))}
      </Bench>
    </div>
  );
}

function PlayerJersey({ row }: { row: SquadRow }) {
  const p = row.players;
  return (
    <Jersey
      color={p.clubs?.primary_color ?? "#8494AC"}
      name={p.last_name}
      detail={formatEUR(Number(row.purchase_price))}
      initials={(p.clubs?.name ?? "???").slice(0, 3).toUpperCase()}
      isCaptain={row.is_captain}
      isViceCaptain={row.is_vice_captain}
      flag={p.status !== "available" ? p.status : null}
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="bg-navy-800 ring-1 ring-black/20 rounded-lg px-3 py-1.5">
      <span className="text-slate-400">{label} </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
