"use server";

import { revalidateTag } from "next/cache";
import { reportEvent } from "@/lib/monitor";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: "anon" | "mismatch" | "admin" | "failed" };

/**
 * Trajno brisanje sopstvenog naloga (Podešavanja → „Obriši nalog“).
 *
 * KO SME: samo prijavljen korisnik, i samo SVOJ nalog — identitet se ne prima iz
 * pregledača, nego se čita iz sesije preko `getUser()` (proverava se kod Auth
 * servera, ne samo potpis tokena), isto kao u lib/admin-guard.ts.
 *
 * ŠTA SE BRIŠE: red u auth.users, a preko ON DELETE CASCADE (schema.sql) i
 * profil (users), sastavi, transferi, čipovi, poeni po kolima i članstva u
 * ligama. Lige koje je korisnik NAPRAVIO ostaju ostalim članovima: kolona
 * leagues.created_by nema CASCADE, pa bi brisanje palo — zato se prvo prazni.
 *
 * Servisni ključ je neophodan (brisanje naloga je admin operacija u Supabase-u),
 * ali se koristi tek pošto je sesija potvrđena i ime tima se poklopilo.
 *
 * Greške se VRAĆAJU kao vrednost, ne bacaju: u produkciji Next sakriva poruku
 * bačene greške, pa bi korisnik video samo opšti ekran greške.
 */
export async function deleteAccountAction(confirmTeamName: string): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "anon" };

  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("users")
    .select("team_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  // Admin nalog se ne briše odavde: sajt bi mogao da ostane bez ijednog admina.
  if (profile?.is_admin) return { ok: false, reason: "admin" };
  if (profile && String(confirmTeamName ?? "").trim() !== profile.team_name) {
    return { ok: false, reason: "mismatch" };
  }

  const { error: leaguesError } = await admin.from("leagues").update({ created_by: null }).eq("created_by", user.id);
  if (leaguesError) {
    await reportEvent({
      level: "error",
      source: "account:delete",
      message: `Brisanje naloga: lige nisu oslobođene — ${leaguesError.message}`,
    });
    return { ok: false, reason: "failed" };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    await reportEvent({
      level: "error",
      source: "account:delete",
      message: `Brisanje naloga nije uspelo — ${deleteError.message}`,
    });
    return { ok: false, reason: "failed" };
  }

  // Nalog više ne postoji; odjava samo čisti kolačiće sesije u ovom pregledaču.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Kolačić će ionako biti odbijen pri sledećem zahtevu.
  }
  // Tim nestaje sa rang lista odmah, ne posle isteka keša.
  revalidateTag("public-data", { expire: 0 });
  return { ok: true };
}
