import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
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

  const t = await getTranslations("nav");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { team_name: string; team_color: string; is_admin: boolean } | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("team_name, team_color, is_admin")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const navLinks = [
    { href: "/moj-tim", label: t("myTeam") },
    { href: "/raspored", label: t("fixtures") },
    { href: "/liga", label: t("league") },
    { href: "/statistike", label: t("stats") },
    { href: "/podesavanja", label: t("settings") },
  ] as const;

  return (
    <html
      lang={LOCALE_META[locale as Locale].htmlLang}
      className={`${oswald.variable} ${inter.variable}`}
    >
      <body className="font-body">
        <NextIntlClientProvider>
          <div className="max-w-[1180px] mx-auto min-h-screen flex flex-col">
            <header className="flex items-center justify-between gap-4 flex-wrap px-4 sm:px-7 py-4 border-b border-navy-700">
              <Link href="/" className="flex items-baseline gap-2.5">
                <span className="font-display font-bold text-xl bg-gold-400 text-navy-950 px-2 py-0.5 rounded">
                  Fudaristo
                </span>
                <span className="text-sm text-slate-400 font-medium">Fantasy Ελλάδα</span>
              </Link>

              <nav className="order-last w-full lg:order-none lg:w-auto flex gap-0.5 sm:gap-1.5 bg-navy-800 p-1 rounded-lg overflow-x-auto">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="shrink-0 text-sm font-semibold text-slate-300 hover:text-chalk-50 px-3 sm:px-4 py-2 rounded-md transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                {profile?.is_admin && (
                  <Link
                    href="/admin"
                    className="shrink-0 text-sm font-semibold text-gold-300 hover:text-gold-400 px-3 sm:px-4 py-2 rounded-md transition-colors"
                  >
                    {t("admin")}
                  </Link>
                )}
              </nav>

              <div className="flex items-center gap-3">
                <LocaleSwitcher />

                {profile ? (
                  <div className="flex items-center gap-3 bg-navy-800 rounded-full pl-1.5 pr-4 py-1.5 border border-navy-600">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-navy-950 text-xs"
                      style={{ backgroundColor: profile.team_color }}
                    >
                      {profile.team_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="leading-tight">
                      <div className="text-xs font-semibold">{profile.team_name}</div>
                      <LogoutButton />
                    </div>
                  </div>
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
            </header>

            <main className="flex-1 px-4 sm:px-7 py-6">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
