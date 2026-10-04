/**
 * Zone na tabeli Super lige (posle regularnog dela sezone):
 *  - prva 4 mesta   → Championship Group
 *  - sledeća 4      → Conference League Group
 *  - ostala (6)     → Relegation Group
 * Zone su po MESTU na tabeli, pa važe i kad se broj klubova promeni.
 */
export type LeagueZone = "championship" | "conference" | "relegation";

export function zoneFor(rank: number): LeagueZone {
  if (rank <= 4) return "championship";
  if (rank <= 8) return "conference";
  return "relegation";
}

/** Klase za oznaku mesta (broj u obojenom polju). */
export const ZONE_RANK_CLASS: Record<LeagueZone, string> = {
  championship: "bg-[#0D5EAF] text-white",
  conference: "bg-gold-400 text-navy-950",
  relegation: "bg-danger-400 text-white",
};
