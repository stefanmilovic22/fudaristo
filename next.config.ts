import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Namerno prazno za sada — dodaj images.remotePatterns kad budeš servirao
  // avatare/grbove sa Supabase Storage-a
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
