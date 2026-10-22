import { getTranslations } from "next-intl/server";
import { SiteCard, OG_SIZE } from "@/lib/og/cards";
import { renderPng } from "@/lib/og/render";
import { normalizeLang } from "@/lib/share";

/** Podrazumevana slika pregleda linka za ceo sajt (početna i sve bez svoje slike). */
export async function GET(request: Request) {
  const locale = normalizeLang(new URL(request.url).searchParams.get("lang"));
  const t = await getTranslations({ locale, namespace: "og" });
  return renderPng(<SiteCard title="FUDARISTO" tagline={t("tagline")} />, OG_SIZE);
}
