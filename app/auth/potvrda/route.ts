import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Odredište SVIH linkova iz mejla — i potvrde registracije i reseta lozinke.
 *
 * Tok: korisnik klikne link → Supabase proveri token na svojoj strani →
 * preusmeri ovamo → ovde se kod menja za sesiju → korisnik ide dalje.
 *
 * Zašto ruta a ne stranica: `exchangeCodeForSession` mora da upiše kolačiće
 * sesije, a to se radi u Route Handler-u. Uz to, PKCE verifier koji je klijent
 * ostavio u kolačiću čita server preko @supabase/ssr.
 *
 * Ruta je van [locale] jer je njena adresa upisana u Supabase podešavanjima i
 * ne sme da se menja sa jezikom; jezik se čita iz kolačića koji postavlja
 * next-intl.
 *
 * KUDA DALJE: `?next=` koji pozivalac zada. Registracija šalje /moj-tim, reset
 * lozinke /nova-lozinka. Ranije je uvek vodilo na /nova-lozinka, pa bi korisnik
 * posle potvrde mejla završio na stranici za promenu lozinke koju nije tražio.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  const prefix =
    cookieLocale &&
    cookieLocale !== routing.defaultLocale &&
    (routing.locales as readonly string[]).includes(cookieLocale)
      ? `/${cookieLocale}`
      : "";

  // Samo interna putanja — `next` dolazi iz adrese, pa bi inače bio otvoreno
  // preusmerenje na tuđi sajt odmah posle potvrde naloga.
  const rawNext = searchParams.get("next");
  const next = rawNext && /^\/(?!\/)/.test(rawNext) ? rawNext : "/nova-lozinka";

  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}${prefix}/login?greska=${reason}`);

  // Supabase sam javlja grešku u adresi kad je token istekao ili već iskorišćen.
  // Bez ove provere bi se to tumačilo kao "neko je otvorio rutu direktno".
  const supabaseError = searchParams.get("error_code") ?? searchParams.get("error");
  if (supabaseError) {
    return fail(supabaseError.includes("expired") ? "link-istekao" : "link");
  }

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("link");
    return NextResponse.redirect(`${origin}${prefix}${next}`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      // Supabase šalje "signup" pri potvrdi registracije, "recovery" pri
      // resetu, "email_change" pri promeni adrese. Ranije je tip bio kastovan
      // samo na recovery|email, pa je potvrda registracije prolazila slučajno.
      type: type as "signup" | "recovery" | "email" | "email_change" | "invite",
      token_hash: tokenHash,
    });
    if (error) return fail("link");

    // Ako pozivalac nije zadao odredište, izvedi ga iz tipa linka.
    const fallback = type === "recovery" ? "/nova-lozinka" : "/moj-tim";
    return NextResponse.redirect(`${origin}${prefix}${rawNext ? next : fallback}`);
  }

  return fail("link");
}
