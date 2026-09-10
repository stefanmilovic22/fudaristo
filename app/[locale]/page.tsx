import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTargetGameweek } from "@/lib/gameweek";

/**
 * Poziv na akciju zavisi od toga dokle je korisnik stigao. Ranije je svima
 * pisalo "Napravi svoj klub" i vodilo na registraciju — i onome ko je
 * prijavljen i odavno sastavio tim.
 *
 * Tri stanja: neprijavljen → registracija; prijavljen bez sastava → sastavi;
 * prijavljen sa sastavom → otvori klub.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let hasSquad = false;
  let teamName: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("team_name")
      .eq("id", user.id)
      .maybeSingle();
    teamName = profile?.team_name ?? null;

    // Sastav se traži za kolo koje se trenutno uređuje — isto kolo koje
    // otvara /moj-tim, da poruka ovde i stranica tamo ne govore različito.
    const targetGw = await getTargetGameweek(supabase);
    if (targetGw) {
      const { count } = await supabase
        .from("squads")
        .select("player_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("gameweek_id", targetGw.id);
      hasSquad = (count ?? 0) > 0;
    }
  }

  const cta = !user
    ? { href: "/register", label: t("ctaNew") }
    : hasSquad
      ? { href: "/moj-tim", label: t("ctaOpen") }
      : { href: "/moj-tim", label: t("ctaBuild") };

  return (
    <section className="flex flex-col items-start gap-6 py-16">
      <h1 className="font-display text-4xl font-semibold max-w-lg leading-tight">
        {user && teamName
          ? t.rich("welcomeBack", {
              teamName,
              b: (chunks) => <span className="text-gold-300">{chunks}</span>,
            })
          : t("headline")}
      </h1>
      <p className="text-slate-300 max-w-md leading-relaxed">
        {user && hasSquad ? t("pitchReturning") : t("pitch")}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={cta.href}
          className="bg-gold-400 text-navy-950 font-bold text-sm px-6 py-3 rounded-lg hover:bg-gold-300 transition-colors"
        >
          {cta.label}
        </Link>
        {user && hasSquad && (
          <Link
            href="/liga"
            className="border border-navy-600 text-slate-300 font-semibold text-sm px-6 py-3 rounded-lg hover:text-chalk-50 hover:border-slate-500 transition-colors"
          >
            {t("ctaLeague")}
          </Link>
        )}
      </div>
    </section>
  );
}
