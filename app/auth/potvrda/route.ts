import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Odredište linka iz mejla za reset lozinke.
 *
 * Tok: korisnik klikne link → Supabase proveri token na SVOJOJ strani →
 * preusmeri ovamo sa kodom → ovde se kod menja za sesiju → korisnik ide na
 * /nova-lozinka, gde je već prijavljen i sme da postavi lozinku.
 *
 * Zašto ruta a ne stranica: `exchangeCodeForSession` mora da upiše kolačiće
 * sesije, a to se radi u Route Handler-u. Uz to, PKCE verifier koji je klijent
 * ostavio u kolačiću čita server preko @supabase/ssr — zato razmena radi i kad
 * je korisnik otvorio link u istom pregledaču u kom je tražio reset.
 *
 * Podržana su OBA oblika koja Supabase šalje, jer zavise od podešenog email
 * šablona: `?code=` (PKCE, podrazumevano za @supabase/ssr) i
 * `?token_hash=&type=recovery` (noviji šablon sa {{ .TokenHash }}).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  const failed = NextResponse.redirect(`${origin}/zaboravljena-lozinka?greska=link`);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return failed;
    return NextResponse.redirect(`${origin}/nova-lozinka`);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "email",
      token_hash: tokenHash,
    });
    if (error) return failed;
    return NextResponse.redirect(`${origin}/nova-lozinka`);
  }

  // Ni jedno ni drugo — verovatno je neko otvorio rutu direktno.
  return failed;
}
