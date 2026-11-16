import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * Otisak sadržaja svake slike dresa i grba: { "/jerseys/aek.png": "1a2b3c4d", … }.
 *
 * Slike se u pregledaču čuvaju 7 dana (videti headers ispod), a ime fajla se pri
 * izmeni ne menja — bez ovoga bi korisnici danima gledali stari dres. Otisak se
 * dodaje na adresu kao ?v=… (lib/asset-url.ts), pa izmenjena slika dobija novu
 * adresu čim se sajt ponovo izgradi, a neizmenjene ostaju u kešu.
 */
function assetVersions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dir of ["jerseys", "crests"]) {
    const abs = path.join(process.cwd(), "public", dir);
    if (!existsSync(abs)) continue;
    for (const file of readdirSync(abs)) {
      if (!/\.(png|jpe?g|webp|svg)$/i.test(file)) continue;
      out[`/${dir}/${file}`] = createHash("md5").update(readFileSync(path.join(abs, file))).digest("hex").slice(0, 8);
    }
  }
  return out;
}

/**
 * Bezbednosna zaglavlja za sve odgovore.
 *
 * Namerno BEZ pune Content-Security-Policy (script-src…): Next ubacuje inline
 * skripte, a reCAPTCHA i zastave (flagcdn) dolaze sa strane — pogrešna politika
 * bi tiho polomila prijavu. `frame-ancestors` je deo CSP-a koji ništa od toga ne
 * dira: samo zabranjuje da se sajt prikaže unutar tuđeg okvira (clickjacking).
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Namerno bez images.remotePatterns za sada — dodaj kad budeš servirao
  // avatare/grbove sa Supabase Storage-a.
  poweredByHeader: false,
  compress: true,
  env: {
    NEXT_PUBLIC_ASSET_VERSIONS: JSON.stringify(assetVersions()),
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      {
        // Grbovi klubova su mali i retko se menjaju — isto keširanje kao dresovi.
        source: "/crests/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
      {
        // Fotografije dresova su male i retko se menjaju: keš u browseru i na
        // CDN-u, uz osvežavanje u pozadini — ne skidaju se ponovo pri svakoj poseti.
        source: "/jerseys/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
  },
  experimental: {
    // Već posećena stranica se u pregledaču drži 30s (podrazumevano 0): povratak
    // nazad i ponovno otvaranje iste stranice su trenutni. Posle izmena podataka
    // (server akcije, router.refresh) keš se i dalje sam poništava, a prijava i
    // odjava rade punom navigacijom.
    staleTimes: { dynamic: 30, static: 180 },
    // Uvozi samo ono što se koristi iz paketa umesto celog modula (manji bundle).
    optimizePackageImports: ["next-intl", "@supabase/supabase-js"],
    // SofaScore bulk-unos šalje više mečeva odjednom (previewSofascoreBulkAction)
    // — podrazumevanih 1MB je bilo dovoljno za par mečeva, ali ne za 5 kola
    // odjednom. Skript koji generiše fajl (dat admin-u posebno) već skida
    // nepotrebna polja, ovo je samo dodatna rezerva.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
