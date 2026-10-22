import type { SupabaseClient } from "@supabase/supabase-js";
import { routing } from "@/i18n/routing";

export type LeagueSummary = {
  id: string;
  name: string;
  inviteCode: string;
  members: number;
  myRank: number | null;
};

export type StandingRow = {
  user_id: string;
  team_name: string;
  team_color: string | null;
  total_points: number | string | null;
  rank: number | string;
};

/** Šifra pozivnice: samo velika slova i cifre, bez I/O/0/1 (isti skup kao u bazi). */
export const INVITE_CODE_LENGTH = 6;
export function normalizeInviteCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, INVITE_CODE_LENGTH);
}

/** Putanja do stranice poziva, sa prefiksom jezika kad nije podrazumevani. */
export function invitePath(code: string, locale: string) {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${prefix}/liga/pridruzi/${code}`;
}

/**
 * Samo BROJ privatnih liga u kojima je korisnik — jedan lak upit, za značku na
 * tabu. Pun spisak (sa članovima i plasmanom) traži poseban poziv po ligi
 * (loadMyLeagues), pa se ne učitava tamo gde ne treba.
 */
export async function countMyLeagues(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from("league_memberships")
    .select("league_id, leagues!inner(is_global)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("leagues.is_global", false);
  return count ?? 0;
}

/**
 * Lige u kojima je korisnik, sa brojem članova i njegovim plasmanom.
 * RLS vraća samo lige čiji je član, pa nema potrebe za dodatnim filtriranjem;
 * globalna liga se ne prikazuje ovde (ona ima svoj tab).
 */
export async function loadMyLeagues(supabase: SupabaseClient, userId: string): Promise<LeagueSummary[]> {
  const { data } = await supabase
    .from("league_memberships")
    .select("joined_at, leagues(id, name, invite_code, is_global)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });

  const leagues = ((data ?? []) as any[])
    .map((r) => r.leagues)
    .filter((l) => l && !l.is_global);

  return Promise.all(
    leagues.map(async (l) => {
      const { data: rows } = await supabase.rpc("league_standings", { p_league_id: l.id });
      const standings = (rows ?? []) as StandingRow[];
      const mine = standings.find((s) => s.user_id === userId);
      return {
        id: l.id as string,
        name: l.name as string,
        inviteCode: l.invite_code as string,
        members: standings.length,
        myRank: mine ? Number(mine.rank) : null,
      };
    })
  );
}
