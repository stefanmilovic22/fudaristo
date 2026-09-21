import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTargetGameweek } from "@/lib/gameweek";
import { Pitch, PitchRow } from "@/components/Pitch";
import { Jersey } from "@/components/Jersey";
import { DeadlineCountdown } from "@/components/DeadlineCountdown";

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

  // Rok sledećeg otvorenog kola — javan podatak, treba i neprijavljenom
  // posetiocu za odbrojavanje na hero sekciji.
  const targetGw = await getTargetGameweek(supabase);

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
    <div className="flex flex-col gap-6 sm:gap-8 py-1 sm:py-2 lg:justify-center lg:min-h-[calc(100vh-140px)]">
      <section className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-12">
        <div className="flex flex-col items-start gap-3 sm:gap-4 lg:gap-5 flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold max-w-lg leading-tight">
            {user && teamName
              ? t.rich("welcomeBack", {
                  teamName,
                  b: (chunks) => <span className="text-gold-300">{chunks}</span>,
                })
              : t("headline")}
          </h1>
          <p className="text-slate-300 max-w-md leading-relaxed text-sm sm:text-base">
            {user && hasSquad ? t("pitchReturning") : t("pitch")}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={cta.href}
              className="bg-gold-400 text-navy-950 font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-gold-300 transition-colors"
            >
              {cta.label}
            </Link>
            {user && hasSquad && (
              <Link
                href="/liga"
                className="border border-navy-600 text-slate-300 font-semibold text-sm px-5 py-2.5 rounded-lg hover:text-chalk-50 hover:border-slate-500 transition-colors"
              >
                {t("ctaLeague")}
              </Link>
            )}
          </div>

          {targetGw && (
            <DeadlineCountdown deadlineAt={targetGw.deadline_at} gameweekNumber={targetGw.number} />
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-lg mt-1">
            <HowItWorksStep number={1} title={t("step1Title")} body={t("step1Body")} />
            <HowItWorksStep number={2} title={t("step2Title")} body={t("step2Body")} />
            <HowItWorksStep number={3} title={t("step3Title")} body={t("step3Body")} />
          </div>
        </div>

        {/* Mockup postava — isti Pitch/Jersey koje koristi /moj-tim, ovde
            samo dekorativan (bez onClick/onRemove). Puna postava 4-3-3
            (golman + sve tri linije), u "compact" veličini dresa — isti
            trik kao na /moj-tim — da cela slika stane na ekran bez
            skrolovanja, a da se ništa od formacije ne izbaci. Ovo je
            najjača vizuelna stvar u aplikaciji i ranije je posetilac nikad
            nije video pre registracije. */}
        <div className="w-[210px] xs:w-[240px] sm:w-[270px] mx-auto lg:mx-0 lg:shrink-0" aria-hidden>
          <Pitch>
            <div className="flex flex-col gap-1.5 xs:gap-2 sm:gap-2.5">
              <PitchRow>
                <Jersey compact color="#28405F" isGoalkeeper />
              </PitchRow>
              <PitchRow>
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" />
              </PitchRow>
              <PitchRow>
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" />
              </PitchRow>
              <PitchRow>
                <Jersey compact color="#E8B33D" />
                <Jersey compact color="#E8B33D" isCaptain />
                <Jersey compact color="#E8B33D" />
              </PitchRow>
            </div>
          </Pitch>
        </div>
      </section>
    </div>
  );
}

/**
 * "Kako radi" je namerno samo broj + naslov, bez opisa — pun tekst je u
 * `title` (tooltip). Cilj je da ceo hero (uključujući ovo) stane na jedan
 * ekran bez skrolovanja; opis od dve rečenice po koraku bi to onemogućio i
 * na desktopu i, još više, na telefonu.
 */
function HowItWorksStep({ number, title, body }: { number: number; title: string; body: string }) {
  return (
    <div className="bg-navy-800 border border-navy-700 rounded-lg p-2 sm:p-2.5" title={body}>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold-400 text-navy-950 font-display font-bold text-[11px] mb-1">
        {number}
      </span>
      <h3 className="font-display text-[11px] sm:text-xs leading-tight">{title}</h3>
    </div>
  );
}
