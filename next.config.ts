import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Namerno bez images.remotePatterns za sada — dodaj kad budeš servirao
  // avatare/grbove sa Supabase Storage-a.
  poweredByHeader: false,
  compress: true,
  async headers() {
    return [
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
