import { getTranslations, setRequestLocale } from "next-intl/server";
import { InfoPage, type InfoSection } from "@/components/InfoPage";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: `${t("title")} — Fudaristo` };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  return (
    <InfoPage
      title={t("title")}
      lead={t("lead")}
      sections={t.raw("sections") as InfoSection[]}
    />
  );
}
