"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_PLAYERS_PER_CLUB,
  formatEUR,
  playerFullName,
  type Position,
  type SelectablePlayer,
} from "@/lib/fantasy-rules";

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

export function TransferClient({
  gameweekId,
  squadRows,
  allPlayers,
  budgetRemaining,
  freeTransfers,
  isPreSeason,
}: {
  gameweekId: string;
  squadRows: SquadRow[];
  allPlayers: SelectablePlayer[];
  budgetRemaining: number;
  freeTransfers: number;
  isPreSeason: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [sellId, setSellId] = useState<string | null>(null);
  const [buyId, setBuyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const squadPlayerIds = useMemo(() => new Set(squadRows.map((r) => r.player_id)), [squadRows]);
  const sellRow = squadRows.find((r) => r.player_id === sellId) ?? null;
  const buyPlayer = allPlayers.find((p) => p.id === buyId) ?? null;

  const candidates = useMemo(() => {
    if (!sellRow) return [];
    return allPlayers
      .filter((p) => p.position === sellRow.players.position)
      .filter((p) => !squadPlayerIds.has(p.id) || p.id === sellRow.player_id)
      .filter((p) => p.id !== sellRow.player_id)
      .filter((p) => playerFullName(p).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.price - a.price);
  }, [sellRow, allPlayers, squadPlayerIds, search]);

  function clubCountExcluding(clubId: string, excludePlayerId: string) {
    return squadRows.filter((r) => r.player_id !== excludePlayerId && r.players.club_id === clubId).length;
  }

  const netBudgetChange = sellRow && buyPlayer ? sellRow.purchase_price - buyPlayer.price : 0;
  const budgetAfter = budgetRemaining + netBudgetChange;
  // GDD sekcija 4: pre prvog deadline-a su transferi neograničeni i bez penala.
  const cost = isPreSeason ? 0 : freeTransfers > 0 ? 0 : -4;

  // clubCountExcluding već izbacuje prodatog igrača, pa je novi uvek +1 —
  // raniji uslov je tu imao suvišan "? 0 : 1" koji je logički pogrešan (u
  // praksi nije propuštao nevalidan transfer, ali bi postao pravi bug čim
  // Faza 8 doda više transfera u jednoj sesiji).
  const buyBlocked =
    sellRow && buyPlayer
      ? budgetAfter < 0 ||
        clubCountExcluding(buyPlayer.club_id, sellRow.player_id) + 1 > MAX_PLAYERS_PER_CLUB
      : false;

  function selectSell(id: string) {
    setSellId((prev) => (prev === id ? null : id));
    setBuyId(null);
    setError(null);
  }

  async function confirmTransfer() {
    if (!sellRow || !buyPlayer || buyBlocked) return;
    setSaving(true);
    setError(null);

    // Ranije su ovo bila 4 odvojena zahteva iz browsera; ako bi treći pao,
    // korisnik bi trajno ostao sa 14 igrača. Sad je sve jedna transakcija u
    // bazi, uz serversku proveru roka, pozicije, budžeta i max-3-po-klubu.
    const { data, error: rpcError } = await supabase.rpc("make_transfer", {
      p_gameweek_id: gameweekId,
      p_player_out: sellRow.player_id,
      p_player_in: buyPlayer.id,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }
    if (data && data.ok === false) {
      setError("Transfer nije izvršen — osveži stranicu i pokušaj ponovo.");
      setSaving(false);
      return;
    }

    setSellId(null);
    setBuyId(null);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
      {/* Trenutni tim */}
      <div className="bg-navy-800 rounded-xl p-4 h-fit">
        <h3 className="font-display text-lg mb-3">Trenutni tim</h3>
        <div className="flex flex-col gap-1.5">
          {squadRows.map((r) => (
            <button
              key={r.player_id}
              onClick={() => selectSell(r.player_id)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-sm text-left transition-colors ${
                sellId === r.player_id
                  ? "bg-danger-400/20 border border-danger-400"
                  : "bg-navy-700 border border-transparent hover:border-navy-600"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <span
                  className="w-5 h-5 rounded-full shrink-0"
                  style={{ backgroundColor: r.players.clubs?.primary_color ?? "#8494AC" }}
                />
                <span className="truncate">
                  {playerFullName(r.players)}
                  {r.is_captain && <span className="text-gold-400 font-bold ml-1">(C)</span>}
                </span>
              </span>
              <span className="text-slate-400 shrink-0 ml-2">{formatEUR(r.purchase_price)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Kandidati za kupovinu */}
      <div>
        {!sellRow && (
          <p className="text-slate-400 text-sm mb-4">
            Klikni na igrača levo da ga predložiš za prodaju — pokazaću ti zamene na istoj
            poziciji.
          </p>
        )}

        {sellRow && (
          <>
            <input
              type="text"
              placeholder={`Pretraži zamenu na poziciji ${sellRow.players.position}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-chalk-50 mb-4 w-full max-w-sm"
            />

            <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto pr-1">
              {candidates.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setBuyId(p.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    buyId === p.id
                      ? "bg-gold-400/20 border border-gold-400"
                      : "bg-navy-800 border border-navy-700 hover:border-navy-600"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-navy-950"
                      style={{ backgroundColor: p.club_color }}
                    >
                      {p.club_name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      {playerFullName(p)}
                      {p.status !== "available" && (
                        <span className="text-danger-400 text-xs ml-1.5">({p.status})</span>
                      )}
                    </span>
                  </span>
                  <span className="text-slate-400 font-semibold">{formatEUR(p.price)}</span>
                </button>
              ))}
              {candidates.length === 0 && (
                <p className="text-slate-400 text-sm py-4">Nema dostupnih zamena za ovu pretragu.</p>
              )}
            </div>
          </>
        )}

        {sellRow && buyPlayer && (
          <div className="bg-navy-800 rounded-xl p-4 mt-5 max-w-md">
            <p className="text-sm mb-1">
              Prodaješ <strong>{playerFullName(sellRow.players)}</strong> ({formatEUR(sellRow.purchase_price)}) →
              Kupuješ <strong>{playerFullName(buyPlayer)}</strong> ({formatEUR(buyPlayer.price)})
            </p>
            <p className="text-sm text-slate-400 mb-1">
              Budžet posle: {formatEUR(budgetAfter)}
              {isPreSeason ? (
                " · Bez penala (pre prvog deadline-a)"
              ) : (
                <>
                  {" "}· Trošak: {cost} poena · Preostalo slobodnih transfera posle:{" "}
                  {Math.max(0, freeTransfers - 1)}
                </>
              )}
            </p>
            {buyBlocked && (
              <p className="text-danger-400 text-sm mb-2">
                Ovaj transfer nije moguć (budžet ili maks. {MAX_PLAYERS_PER_CLUB} igrača iz istog
                kluba).
              </p>
            )}
            {error && <p className="text-danger-400 text-sm mb-2">{error}</p>}
            <div className="flex gap-2 mt-2">
              <button
                onClick={confirmTransfer}
                disabled={buyBlocked || saving}
                className="bg-gold-400 text-navy-950 font-bold text-sm px-4 py-2 rounded-lg disabled:opacity-40"
              >
                {saving ? "Izvršavam..." : "Potvrdi transfer"}
              </button>
              <button
                onClick={() => setBuyId(null)}
                className="text-slate-300 text-sm px-4 py-2 rounded-lg border border-navy-600"
              >
                Otkaži
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
