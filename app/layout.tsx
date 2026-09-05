import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Fudaristo — Fantasy Ελλάδα",
  description: "Fantasy fudbal aplikacija za grčku Super League",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { team_name: string; team_color: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("team_name, team_color")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return (
    <html lang="sr" className={`${oswald.variable} ${inter.variable}`}>
      <body className="font-body">
        <div className="max-w-[1180px] mx-auto min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-7 py-4 border-b border-navy-700">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="font-display font-bold text-xl bg-gold-400 text-navy-950 px-2 py-0.5 rounded">
                Fudaristo
              </span>
              <span className="text-sm text-slate-400 font-medium">
                Fantasy Ελλάδα
              </span>
            </Link>
            <nav className="flex gap-1.5 bg-navy-800 p-1 rounded-lg">
              <Link
                href="/moj-tim"
                className="text-sm font-semibold text-slate-300 hover:text-chalk-50 px-4 py-2 rounded-md transition-colors"
              >
                Moj klub
              </Link>
              <Link
                href="/transferi"
                className="text-sm font-semibold text-slate-300 hover:text-chalk-50 px-4 py-2 rounded-md transition-colors"
              >
                Transferi
              </Link>
              <Link
                href="/liga"
                className="text-sm font-semibold text-slate-300 hover:text-chalk-50 px-4 py-2 rounded-md transition-colors"
              >
                Liga
              </Link>
              <Link
                href="/statistike"
                className="text-sm font-semibold text-slate-300 hover:text-chalk-50 px-4 py-2 rounded-md transition-colors"
              >
                Statistike
              </Link>
            </nav>

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
                  Prijava
                </Link>
                <Link href="/register" className="text-gold-300">
                  Registruj se
                </Link>
              </div>
            )}
          </header>
          <main className="flex-1 px-7 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}

