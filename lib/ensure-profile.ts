import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CurrentUser } from "@/lib/supabase/current-user";

export type Profile = { team_name: string; team_color: string; is_admin: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prijavljen korisnik bez reda u public.users (trigger on_auth_user_created iz
 * migracije 003 nije napravio profil) bi inače izgledao kao neprijavljen —
 * zaglavlje traži profil — a tim ne bi mogao da se sačuva (FK na users).
 *
 * Profil se zato pravi odavde, iz podataka koje je registracija upisala u
 * nalog. Nikad ne baca: ako i ovo ne uspe, pozivalac nastavlja bez profila.
 */
export async function ensureProfile(user: CurrentUser): Promise<Profile | null> {
  try {
    const admin = createServiceRoleClient();
    const meta = user.metadata ?? {};
    const fallbackName = `Tim ${user.id.slice(0, 8)}`;
    const name = typeof meta.team_name === "string" && meta.team_name.trim() ? meta.team_name.trim() : fallbackName;
    const color =
      typeof meta.team_color === "string" && /^#[0-9A-Fa-f]{6}$/.test(meta.team_color) ? meta.team_color : "#1E88E5";
    const fav =
      typeof meta.favorite_club_id === "string" && UUID_RE.test(meta.favorite_club_id)
        ? meta.favorite_club_id
        : null;

    // Prvo sa svim podacima; ako padne (ime tima već zauzeto, nepostojeći klub),
    // pokušaj sa bezbednim podrazumevanim vrednostima.
    const attempts = [
      { id: user.id, team_name: name, team_color: color, favorite_club_id: fav },
      { id: user.id, team_name: fallbackName, team_color: color, favorite_club_id: null },
    ];
    for (const row of attempts) {
      const { error } = await admin.from("users").insert(row);
      if (!error) break;
      // Red je u međuvremenu napravljen (trigger ili paralelan zahtev) — dobro.
      if (error.code === "23505" && /users_pkey|\(id\)/.test(`${error.message} ${error.details ?? ""}`)) break;
    }

    const { data } = await admin
      .from("users")
      .select("team_name, team_color, is_admin")
      .eq("id", user.id)
      .maybeSingle();
    return data ?? null;
  } catch (e) {
    console.error("[ensureProfile]", e);
    return null;
  }
}
