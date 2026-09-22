import { getTranslations, setRequestLocale } from "next-intl/server";
import { RulesBoard } from "./rules-board";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return { title: `${t("title")} — Fudaristo` };
}

/**
 * Statična stranica — nema upita ka bazi, pravila igre su isti tekst za svakog
 * korisnika. Sadržaj (RulesBoard) je klijentska komponenta samo zbog
 * scroll-spy menija sa strane, isto kao StatsBoard za tabove.
 */
export default async function PravilaPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RulesBoard />;
}
