import "./globals.css";

/**
 * Korenski layout je namerno prazan omotač bez <html>/<body>.
 *
 * Next traži da koren postoji, ali sav sadržaj — uključujući `lang` atribut,
 * koji zavisi od jezika — pravi app/[locale]/layout.tsx. Ovde bi `lang` mogao
 * da bude samo pogađanje.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
