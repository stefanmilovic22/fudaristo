import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Namerno prazno za sada — dodaj images.remotePatterns kad budeš servirao
  // avatare/grbove sa Supabase Storage-a
  experimental: {
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
