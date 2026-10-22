import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type PriceChangeRow = {
  playerId: string;
  name: string;
  clubShort: string;
  clubColor: string;
  oldPrice: number;
  newPrice: number;
  net: number;
};

export type LastPriceChanges = {
  changedAt: string | null;
  gameweekNumber: number | null;
  rows: PriceChangeRow[];
};

/**
 * Poslednja izmena cena = svi redovi istorije sa najnovijim `changed_at`
 * (apply_price_changes piše ceo skup sa istim vremenom). Javni podatak, keš kao
 * i ostali (tag "public-data" — admin ga poništava pri primeni).
 */
export const getLastPriceChanges = unstable_cache(
  async (): Promise<LastPriceChanges> => {
    const supabase = createPublicClient();
    const { data: latest, error: e1 } = await supabase
      .from("player_price_history")
      .select("changed_at")
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw new Error(`player_price_history: ${e1.message}`);
    if (!latest) return { changedAt: null, gameweekNumber: null, rows: [] };

    const { data, error } = await supabase
      .from("player_price_history")
      .select(
        "player_id, old_price, new_price, net_transfers, gameweeks(number), " +
          "players(first_name, last_name, clubs(short_name, primary_color))"
      )
      .eq("changed_at", latest.changed_at);
    if (error) throw new Error(`player_price_history: ${error.message}`);

    const rows: PriceChangeRow[] = ((data ?? []) as any[]).map((r) => ({
      playerId: r.player_id,
      name: `${r.players?.first_name ?? ""} ${r.players?.last_name ?? ""}`.trim() || "?",
      clubShort: r.players?.clubs?.short_name ?? "?",
      clubColor: r.players?.clubs?.primary_color ?? "#93ADCC",
      oldPrice: Number(r.old_price),
      newPrice: Number(r.new_price),
      net: Number(r.net_transfers ?? 0),
    }));
    const gw = (data as any[] | null)?.[0]?.gameweeks?.number ?? null;
    return { changedAt: latest.changed_at as string, gameweekNumber: gw, rows };
  },
  ["last-price-changes-v1"],
  { revalidate: 60, tags: ["public-data"] }
);
