import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

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
  title: "CoachEleven — Fantasy Ελλάδα",
  description: "Fantasy fudbal aplikacija za grčku Super League",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sr" className={`${oswald.variable} ${inter.variable}`}>
      <body className="font-body">
        <div className="max-w-[1180px] mx-auto min-h-screen flex flex-col">
          <header className="flex items-center justify-between px-7 py-4 border-b border-navy-700">
            <Link href="/" className="flex items-baseline gap-2.5">
              <span className="font-display font-bold text-xl bg-gold-400 text-navy-950 px-2 py-0.5 rounded">
                Coach11
              </span>
              <span className="text-sm text-slate-400 font-medium">
                CoachEleven — Fantasy Ελλάδα
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
          </header>
          <main className="flex-1 px-7 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
