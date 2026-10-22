import type { Metadata, Viewport } from "next";
import { Fira_Sans_Extra_Condensed, Inter } from "next/font/google";
import { Suspense } from "react";
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
import { NavProgress } from "@/components/NavProgress";
import { Link } from "@/i18n/navigation";
import { routing, LOCALE_META, type Locale } from "@/i18n/routing";
import { getSiteUrl } from "@/lib/site-url";

// Naslovni font pokriva SVA tri pisma sajta — latinicu (uklj. latin-ext za
// č ć š đ ž), ćirilicu i grčki. Ranije je to bio Oswald koji nema grčka slova,
// pa su grčki naslovi padali na sistemski font i izgledali drugačije.
const display = Fira_Sans_Extra_Condensed({
  subsets: ["latin", "latin-ext", "cyrillic", "greek"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
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
  // Podrazumevani pregled linka za ceo sajt; stranice sa svojom slikom (tim,
  // pozivnica u ligu — app/[locale]/p/) ga zamenjuju. Isti naslov/opis, da
  // WhatsApp ne prikaže prazan pregled.
  const image = `/api/og/site?lang=${locale}`;
  return {
    metadataBase: new URL(getSiteUrl()),
    title: t("title"),
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: "Fudaristo",
      title: t("title"),
      description: t("description"),
      images: [{ url: image, width: 1200, height: 630, alt: "Fudaristo" }],
    },
    twitter: { card: "summary_large_image", title: t("title"), description: t("description"), images: [image] },
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "Fudaristo", statusBarStyle: "black" },
  };
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
      className={`${display.variable} ${inter.variable}`}
    >
      <body className="font-body">
        <NextIntlClientProvider>
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          <a href="#main" className="skip-link">
            {t("skipToContent")}
          </a>
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
            <main id="main" tabIndex={-1} className="flex-1 w-full max-w-[1280px] mx-auto px-3 sm:px-7 py-4 sm:py-6 outline-none">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
