import type { SupabaseClient } from "@supabase/supabase-js";

export type TargetGameweek = {
  id: string;
  number: number;
  deadline_at: string;
};

/**
 * Vraća prvo naredno kolo čiji rok (deadline_at) još nije prošao — jedino
 * kolo za koje trenutno ima smisla praviti/menjati sastav (squads picks se
 * zaključavaju na deadline_at, videti schema.sql).
 *
 * Prenošenje sastava iz prethodnog kola radi carry_over_squad() u bazi
 * (migrations/003-security-and-rpc.sql), koju /moj-tim poziva pre čitanja
 * sastava. Ovde je i dalje samo: NAJBLIŽE otvoreno kolo je "target".
 */
export async function getTargetGameweek(
  supabase: SupabaseClient
): Promise<TargetGameweek | null> {
  const { data } = await supabase
    .from("gameweeks")
    .select("id, number, deadline_at")
    .gt("deadline_at", new Date().toISOString())
    .order("deadline_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ?? null;
}

/**
 * GDD sekcija 4: "Pre prvog deadline-a (formiranje tima): Neograničeni
 * transferi, bez penala." — ovo je PO KORISNIKU, ne globalno vezano za
 * gameweek #1: ko god prvi put gradi tim (čak i ako se registruje kasno,
 * npr. u kolu 5, jer sva ranija kola su već zaključana za druge korisnike),
 * ima pravo na neograničene izmene dok ne prođe deadline TOG kola.
 *
 * Implementacija: korisnik je "u prvom građenju tima" ako nema NIJEDAN red
 * u squads tabeli vezan za kolo sa manjim brojem od ciljanog. Čim jednom ima
 * sastav u nekom ranijem (zaključanom) kolu, sledeći transferi se tretiraju
 * normalno (free_transfers / -4 penal).
 *
 * ⚠️ Ovo je SAMO za prikaz u UI-ju. Isto pravilo je ponovljeno u
 * make_transfer() u bazi i tamo se stvarno odlučuje o penalu — klijent ne
 * sme da bira svoj trošak. Ako menjaš pravilo, promeni na oba mesta.
 */
export async function isBuildingFirstSquad(
  supabase: SupabaseClient,
  userId: string,
  targetGameweekNumber: number
): Promise<boolean> {
  const { data: earlierGameweeks } = await supabase
    .from("gameweeks")
    .select("id")
    .lt("number", targetGameweekNumber);

  const earlierIds = (earlierGameweeks ?? []).map((g) => g.id);
  if (earlierIds.length === 0) return true; // nema ranijih kola uopšte u bazi

  const { count } = await supabase
    .from("squads")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("gameweek_id", earlierIds);

  return (count ?? 0) === 0;
}
