import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BROADCASTERS, REGIONS, flagEmoji } from "@/lib/broadcasters";
import { intlTag } from "@/lib/intl-locale";
import { EmptyState } from "@/components/EmptyState";
import { TvIcon } from "@/components/icons";
import { TvBoard, type TvRegion } from "./tv-board";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tv" });
  return { title: `${t("title")} — Fudaristo` };
}

/**
 * Gde se gleda Super liga Grčke, po zemljama i regionima. Javna stranica;
 * podaci su u lib/broadcasters.ts (ručno održavani, preliminarni, sa datumom
 * provere). Nazivi zemalja se prave na jeziku posetioca iz ISO oznake.
 */
export default async function TvPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tv");
  const names = new Intl.DisplayNames([intlTag(locale)], { type: "region" });

  const regions: TvRegion[] = REGIONS.map((id) => ({
    id,
    title: t(`regions.${id}` as "regions.balkan"),
    countries: BROADCASTERS.filter((c) => c.region === id).map((c) => ({
      code: c.country,
      name: names.of(c.country) ?? c.country,
      flag: flagEmoji(c.country),
      home: c.country === "GR",
      channels: c.broadcasters,
    })),
  })).filter((r) => r.countries.length > 0);

  const total = regions.reduce((n, r) => n + r.countries.length, 0);

  return (
    <div className="mx-auto max-w-[1100px]">
      <h2 className="font-display text-2xl mb-1 flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-gold-400 to-[#3E86F0] text-navy-950 grid place-items-center">
          <TvIcon className="w-5 h-5" />
        </span>
        {t("title")}
      </h2>
      <p className="text-slate-400 text-sm mb-5 max-w-2xl">
        {t("subtitle")} · {t("countriesCount", { count: total })}
      </p>

      {total === 0 ? (
        <EmptyState icon="calendar" title={t("empty")} />
      ) : (
        <TvBoard regions={regions} labels={{ search: t("search"), noMatch: t("noMatch"), home: t("home") }} />
      )}

      <div className="mt-6 bg-navy-800 border border-navy-700 rounded-xl px-4 py-3 text-xs text-slate-400 leading-relaxed flex flex-col gap-1.5">
        <p>{t("disclaimer")}</p>
        <p>
          {t("missing")}{" "}
          <Link href="/kontakt" className="text-gold-300 font-semibold hover:underline">
            {t("contact")} →
          </Link>
        </p>
      </div>
    </div>
  );
}
