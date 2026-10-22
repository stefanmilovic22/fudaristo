import { ImageResponse } from "next/og";
import type { ReactElement } from "react";
import { getOgFonts } from "@/lib/og/fonts";

/**
 * Zajednički omot oko ImageResponse: ugrađeni font + keš zaglavlja.
 * Pregled linka sme da bude star nekoliko minuta (poeni se menjaju jednom po
 * kolu), a „Podeli tim" se ne deli keširanjem između korisnika.
 */
export async function renderPng(
  element: ReactElement,
  size: { width: number; height: number },
  cache: "public" | "private" = "public"
) {
  const fonts = getOgFonts();
  return new ImageResponse(element, {
    ...size,
    fonts,
    headers: {
      "Cache-Control":
        cache === "public"
          ? "public, max-age=300, s-maxage=900, stale-while-revalidate=86400"
          : "private, no-store",
    },
  });
}
