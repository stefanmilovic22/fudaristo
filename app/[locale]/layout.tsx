import type { Metadata, Viewport } from "next";
import { Oswald, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import Image from "next/image";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { ensureProfile } from "@/lib/ensure-profile";
import { UserMenu } from "@/components/UserMenu";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { MainNav } from "@/components/MainNav";
import { Link } from "@/i18n/navigation";
import { routing, LOCALE_META, type Locale } from "@/i18n/routing";

// ⚠️ Oswald NEMA grčke glifove (podržava latin, latin-ext, cyrillic,
// cyrillic-ext, vietnamese). Grčki naslovi zato padaju na sistemski font.
// Vidi napomenu u handover-u — ako smeta, treba zameniti display font onim
// koji pokriva sva tri pisma.
const oswald = Oswald({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
});

const inter = Inter({
  subsets: ["latin", "greek", "cyrillic"],
  variable: "--font-inter",
});

/**
 * Eksplicitan viewport. Next ima podrazumevani, ali `maximumScale` namerno
 * NIJE postavljen — zabrana zumiranja je problem pristupačnosti, a jedini
 * razlog zbog kog se obično dodaje (Safari zumira polja sa fontom < 16px)
 * rešen je time što polja za unos imaju bar 16px na telefonu.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0D1326",
};

// Širina zaglavlja po jeziku: tabovi su na srpskom i grčkom duži nego na
// engleskom, pa im treba više mesta da bi ikonice stale. Sadržaj ispod ostaje
// 1280px na svim jezicima.
const LOCALE_HEADER_WIDTH: Record<Locale, string> = {
  en: "max-w-[1280px]",
  sr: "max-w-[1440px]",
  el: "max-w-[1536px]",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Bez ovoga sve stranice postaju dinamičke pri renderu — setRequestLocale
  // je uslov da statičko generisanje po jeziku uopšte radi.
  setRequestLocale(locale);

  // Prevodi i sesija se čitaju istovremeno; profil zavisi od korisnika pa ide
  // odmah posle (jedan upit, ne dva).
  const [t, user] = await Promise.all([getTranslations("nav"), getCurrentUser()]);

  let profile: { team_name: string; team_color: string; is_admin: boolean } | null = null;
  if (user) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("users")
      .select("team_name, team_color, is_admin")
      .eq("id", user.id)
      .single();
    // Nalog bez reda u users (trigger nije radio) — napravi profil, da korisnik
    // ne izgleda kao odjavljen.
    profile = data ?? (await ensureProfile(user));
  }

  return (
    <html
      lang={LOCALE_META[locale as Locale].htmlLang}
      className={`${oswald.variable} ${inter.variable}`}
    >
      <body className="font-body">
        <NextIntlClientProvider>
          {/* Pozadina zaglavlja ide preko cele širine ekrana; sadržaj u njemu je
              na srpskom i grčkom širi (tabovi su duži), a ispod ostaje 1280px. */}
          <header className="sticky top-0 z-40 bg-gradient-to-r from-navy-950 via-navy-800 to-[#1C3A6E] border-b border-navy-700">
            <div className={`${LOCALE_HEADER_WIDTH[locale as Locale]} mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-7 py-3 sm:py-4`}>
                <Link href="/" aria-label="Fudaristo" className="order-1 flex items-center gap-3 shrink-0">
                  <Image
                    src="/logo.png"
                    alt="Fudaristo"
                    width={56}
                    height={56}
                    priority
                    className="w-11 h-11 sm:w-14 sm:h-14 rounded-full drop-shadow-[0_4px_14px_rgba(124,196,255,0.30)]"
                  />
                  <span className="hidden xs:inline text-sm text-slate-400 font-medium">Fantasy Ελλάδα</span>
                </Link>
  
                <MainNav isAdmin={Boolean(profile?.is_admin)} />
  
                {/* order-2 do xl (ispod menija, kad je meni order-3) — mora da
                    prati isti prag kao MainNav.tsx (videti komentar tamo za
                    zašto xl, ne lg). */}
                {/* shrink-0: bez ovoga isti problem kao nav ranije — flexbox bi
                    sažimao OVU kutiju ispod stvarne širine profil-bedža (koji
                    ima max-w-[220px] ali to ne pomaže ako mu roditelj dobije
                    manje mesta nego što bedž traži), pa bi tekst tima curio
                    preko granice bedža. */}
                <div className="order-3 ml-auto flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
                  <LocaleSwitcher />
  
                  {/* max-w se vraća na xl (kad se traka sa tabovima pojavi i
                      počne da se takmiči za prostor) — bez ovoga bi izuzetno
                      dug naziv tima mogao opet da gurne tabove van ekrana, isti
                      problem kao onaj koji je xl prag gore rešio. */}
                  {profile ? (
                    <UserMenu teamName={profile.team_name} teamColor={profile.team_color} />
                  ) : (
                    <div className="flex gap-3 text-sm font-semibold">
                      <Link href="/login" className="text-slate-300 hover:text-chalk-50">
                        {t("login")}
                      </Link>
                      <Link href="/register" className="text-gold-300">
                        {t("register")}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
          </header>

          <div className="max-w-[1280px] mx-auto min-h-screen flex flex-col">
            <main className="flex-1 w-full max-w-[1280px] mx-auto px-3 sm:px-7 py-4 sm:py-6">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
