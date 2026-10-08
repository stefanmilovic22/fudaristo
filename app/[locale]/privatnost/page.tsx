import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoPage, type InfoSection } from "@/components/InfoPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy" });
  return { title: `${t("title")} — Fudaristo` };
}

export default async function PrivatnostPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("privacy");

  return (
    <InfoPage
      title={t("title")}
      lead={t("lead")}
      sections={t.raw("sections") as InfoSection[]}
      footnote={t("updated")}
    />
  );
}
