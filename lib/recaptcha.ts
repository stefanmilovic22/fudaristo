import "server-only";

/**
 * Provera reCAPTCHA tokena kod Googlea.
 *
 * PONAŠANJE KAD NIJE PODEŠENO — namerno, i vredi razumeti:
 *
 *   ni jedan ni drugi ključ    → provera se PRESKAČE (reCAPTCHA nije uvedena)
 *   samo jedan od dva ključa   → provera PADA (neko je zaboravio pola posla)
 *   oba ključa                 → normalna provera
 *
 * Srednji slučaj je bitan. Da nedostatak tajnog ključa samo preskakao proveru,
 * pogrešan deploy bi tiho isključio zaštitu i niko to ne bi primetio. Ovako
 * registracija odmah pukne sa jasnim razlogom u logu.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
const SECRET = process.env.RECAPTCHA_SECRET_KEY;

/**
 * Prag ocene. Google vraća 0.0 (skoro sigurno bot) do 1.0 (skoro sigurno
 * čovek). 0.5 je Googleova preporuka. Niže od toga propušta previše, više
 * počinje da odbija stvarne ljude — a odbijena registracija je gora šteta od
 * jednog propuštenog bota na demo projektu.
 */
const MIN_SCORE = 0.5;

export type RecaptchaResult =
  | { ok: true; skipped: boolean; score?: number }
  | { ok: false; reason: "misconfigured" | "missing_token" | "rejected" | "unreachable" };

export async function verifyRecaptcha(
  token: string | null,
  expectedAction: string
): Promise<RecaptchaResult> {
  if (!SITE_KEY && !SECRET) return { ok: true, skipped: true };

  if (!SITE_KEY || !SECRET) {
    console.error(
      "[recaptcha] Podešen je samo jedan ključ. Potrebna su OBA: " +
        "NEXT_PUBLIC_RECAPTCHA_SITE_KEY i RECAPTCHA_SECRET_KEY."
    );
    return { ok: false, reason: "misconfigured" };
  }

  if (!token) return { ok: false, reason: "missing_token" };

  let data: {
    success?: boolean;
    score?: number;
    action?: string;
    "error-codes"?: string[];
  };

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: SECRET, response: token }),
      // Bez roka bi pad Googleove usluge značio da registracija visi dok
      // Vercel ne preseče funkciju.
      signal: AbortSignal.timeout(5000),
    });
    data = await response.json();
  } catch (e) {
    console.error("[recaptcha] provera nije dostupna:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "unreachable" };
  }

  if (!data.success) {
    console.warn("[recaptcha] odbijeno:", data["error-codes"]);
    return { ok: false, reason: "rejected" };
  }

  // Provera akcije je bitna: bez nje bi token uzet sa bilo koje druge stranice
  // (npr. prijave) prošao i na registraciji.
  if (data.action !== expectedAction) {
    console.warn(`[recaptcha] pogrešna akcija: "${data.action}" umesto "${expectedAction}"`);
    return { ok: false, reason: "rejected" };
  }

  if (typeof data.score === "number" && data.score < MIN_SCORE) {
    console.warn(`[recaptcha] ocena ${data.score} ispod praga ${MIN_SCORE}`);
    return { ok: false, reason: "rejected" };
  }

  return { ok: true, skipped: false, score: data.score };
}
