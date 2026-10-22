import { cache } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadTeamShare } from "@/lib/team-share";
import { getSiteUrl } from "@/lib/site-url";
import { teamPath, UUID_RE } from "@/lib/share";

/**
 * Stranica SAMO za robote koji prave preglede linkova (WhatsApp, Viber,
 * Facebook…). Pravi posetilac je ne vidi: middleware.ts samo njima prepisuje
 * /tim/[id] na ovu putanju, jer oni ne mogu da se prijave, a sama stranica
 * tima je iza prijave. Zato ovde ide samo naslov, opis i slika — bez sastava.
 */
const getTeam = cache(async (id: string) => {
  if (!UUID_RE.test(id)) return null;
  try {
    return await loadTeamShare(createServiceRoleClient(), id);
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const [t, team] = await Promise.all([getTranslations({ locale, namespace: "og" }), getTeam(id)]);

  const title = team ? t("teamTitle", { team: team.teamName }) : "Fudaristo";
  const description = team
    ? team.rank !== null && team.managers !== null
      ? t("teamDescription", {
          points: team.totalPoints,
          rankOf: t("rankOf", { rank: team.rank, managers: team.managers }),
        })
      : t("teamDescriptionNoRank", { points: team.totalPoints })
    : t("tagline");
  const image = `${getSiteUrl()}/api/og/tim/${id}?lang=${locale}`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Fudaristo",
      title,
      description,
      url: `${getSiteUrl()}${teamPath(id, locale)}`,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function TeamPreviewPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const team = await getTeam(id);
  return (
    <p className="text-slate-400">
      <a href={teamPath(id, locale)}>{team?.teamName ?? "Fudaristo"}</a>
    </p>
  );
}
