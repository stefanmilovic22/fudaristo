"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyRecaptcha } from "@/lib/recaptcha";

/**
 * Registracija bez slanja ijednog mejla.
 *
 * ZAŠTO NE `supabase.auth.signUp()` SA KLIJENTA:
 * Ugrađeni Supabase mejl servis dozvoljava 2 poruke NA SAT za ceo projekat —
 * ne po korisniku. Dok je „Confirm email" uključen, treći korisnik koji pokuša
 * da se registruje u istom satu dobija 429 i ne može da napravi nalog. Za demo
 * koji se deli ljudima to znači da registracija prosto prestane da radi, i to
 * iz razloga koji korisnik ne može da razume ni popravi.
 *
 * Admin API (`admin.createUser` sa `email_confirm: true`) pravi nalog kao već
 * potvrđen i NE ŠALJE mejl, pa limit ne postoji. Radi bez obzira na to kako je
 * podešen toggle u panelu, što je i poenta: ponašanje aplikacije ne sme da
 * zavisi od podešavanja koje niko ne vidi iz koda.
 *
 * ⚠️ CENA: ovo je registracija sa admin ovlašćenjima, dostupna svakome ko
 * otvori stranicu. Supabase-ove ugrađene zaštite (uključujući njegov rate
 * limit) se time zaobilaze, pa validaciju i kočnicu moramo da imamo ovde.
 * Zato su ispod: provera svakog polja na serveru, provera da omiljeni klub
 * stvarno postoji, i gornja granica broja naloga po satu.
 *
 * KAD BUDE VIŠE OD DEMA: podesi custom SMTP (Resend), vrati `signUp()` i
 * uključi potvrdu mejla. Tada Supabase ponovo radi svoj posao, a ova akcija
 * se briše.
 */

const MAX_SIGNUPS_PER_HOUR = 25;

export type RegisterResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "nameTaken" | "emailTaken" | "throttled" | "captcha" | "failed";
      detail?: string;
    };

export async function registerAction(input: {
  email: string;
  password: string;
  teamName: string;
  teamColor: string;
  favoriteClubId: string;
  recaptchaToken: string | null;
}): Promise<RegisterResult> {
  // reCAPTCHA PRVA, pre svega ostalog: bot ne treba ni da dođe do upita nad
  // bazom. Preskače se sama ako ključevi nisu podešeni.
  const captcha = await verifyRecaptcha(input.recaptchaToken, "registracija");
  if (!captcha.ok) return { ok: false, reason: "captcha" };

  const email = input.email.trim().toLowerCase();
  const teamName = input.teamName.trim();

  // Sve provere se ponavljaju ovde iako ih forma već radi: forma je u
  // pregledaču i može se zaobići.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, reason: "invalid" };
  if (input.password.length < 6) return { ok: false, reason: "invalid" };
  if (teamName.length < 3 || teamName.length > 30) return { ok: false, reason: "invalid" };
  if (!/^#[0-9A-Fa-f]{6}$/.test(input.teamColor)) return { ok: false, reason: "invalid" };

  const supabase = createServiceRoleClient();

  // Kočnica protiv masovnog pravljenja naloga. Gruba je namerno — brojanje po
  // vremenu ne traži novu tabelu, a za demo je dovoljno da spreči skriptu koja
  // otvori hiljadu naloga.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .gte("created_at", oneHourAgo);

  if ((recent ?? 0) >= MAX_SIGNUPS_PER_HOUR) return { ok: false, reason: "throttled" };

  // Omiljeni klub mora da postoji — inače bi FK pukao unutar trigera i greška
  // bi stigla kao nerazumljivo "Database error".
  const { data: club } = await supabase
    .from("clubs")
    .select("id")
    .eq("id", input.favoriteClubId)
    .maybeSingle();
  if (!club) return { ok: false, reason: "invalid" };

  const { count: nameTaken } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("team_name", teamName);
  if ((nameTaken ?? 0) > 0) return { ok: false, reason: "nameTaken" };

  const { error } = await supabase.auth.admin.createUser({
    email,
    password: input.password,
    // Ovo je ključ: nalog je odmah potvrđen, pa se mejl ne šalje.
    email_confirm: true,
    // Trigger on_auth_user_created (migracija 003) odavde pravi red u
    // public.users — profil se i dalje kreira u istoj transakciji.
    user_metadata: {
      team_name: teamName,
      team_color: input.teamColor,
      favorite_club_id: input.favoriteClubId,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already registered") || message.includes("already been registered")) {
      return { ok: false, reason: "emailTaken" };
    }
    // Ime tima je UNIQUE; ako je neko uzeo isto ime u međuvremenu, trigger
    // padne i Supabase to vrati kao uopšteno "Database error".
    if (message.includes("database error") || message.includes("duplicate")) {
      return { ok: false, reason: "nameTaken" };
    }
    return { ok: false, reason: "failed", detail: error.message };
  }

  return { ok: true };
}
