import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Klijent BEZ kolačića i bez sesije — samo za javne podatke (igrači, klubovi,
 * mečevi, rang liste; RLS ih dozvoljava svima).
 *
 * Zašto poseban: rezultati koji se keširaju između korisnika (unstable_cache)
 * ne smeju da zavise od kolačića, a klijent iz ./server ih čita. Ovaj nikad ne
 * sme da se koristi za podatke koji pripadaju korisniku (squads, chips_usage…).
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
