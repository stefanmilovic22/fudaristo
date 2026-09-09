import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Zaštita za admin stranice/server action-e. NIJE u middleware.ts jer bismo
 * tamo morali da čitamo iz baze na SVAKI zahtev (uključujući statičke asete)
 * — jeftinije je provera na nivou stranice/akcije.
 *
 * Middleware već traži login za /admin (videti PROTECTED_PREFIXES); ovo je
 * drugi sloj: ulogovan, ali NE admin.
 *
 * DVA ulaza, namerno:
 *   - getAdminAccess() za STRANICE — vraća razlog odbijanja da stranica može
 *     da objasni šta fali. Tiho preusmeravanje na /moj-tim (kako je bilo
 *     ranije) je izgledalo kao da admin panel ne postoji.
 *   - requireAdmin() za SERVER ACTION-e — tvrdo preusmerenje, bez objašnjenja.
 *     Akcija nema šta da renderuje, a odgovor ne sme da procuri ništa.
 */

export type AdminAccess =
  | { ok: true; userId: string; teamName: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; reason: "anon" | "no_profile" | "not_admin"; teamName: string | null };

export async function getAdminAccess(): Promise<AdminAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, reason: "anon", teamName: null };

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, team_name")
    .eq("id", user.id)
    .single();

  if (!profile) return { ok: false, reason: "no_profile", teamName: null };
  if (!profile.is_admin) return { ok: false, reason: "not_admin", teamName: profile.team_name };

  return { ok: true, userId: user.id, teamName: profile.team_name, supabase };
}

export async function requireAdmin() {
  const access = await getAdminAccess();
  if (!access.ok) {
    if (access.reason === "anon") redirect("/login?redirect=/admin");
    redirect("/moj-tim");
  }
  return { userId: access.userId, teamName: access.teamName, supabase: access.supabase };
}
