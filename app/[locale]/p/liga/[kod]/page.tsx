import { cache } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { INVITE_CODE_LENGTH, invitePath, normalizeInviteCode } from "@/lib/leagues";

/**
 * Pregled linka pozivnice u privatnu ligu — vidi komentar u ../tim/[id]/page.tsx
 * (middleware prepisuje /liga/pridruzi/[kod] ovamo samo za robote za preglede).
 * Ime lige i broj članova vidi svako ko ima šifru, ista pravila kao league_preview.
 */
const getLeague = cache(async (rawCode: string) => {
  const code = normalizeInviteCode(rawCode);
  if (code.length !== INVITE_CODE_LENGTH) return null;
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("leagues")
      .select("id, name")
      .eq("invite_code", code)
      .eq("is_global", false)
      .maybeSingle();
    if (!data) return null;
    const { count } = await supabase
      .from("league_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("league_id", data.id);
    return { code, name: data.name as string, members: count ?? 0 };
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; kod: string }>;
}): Promise<Metadata> {
  const { locale, kod } = await params;
  const [t, league] = await Promise.all([getTranslations({ locale, namespace: "og" }), getLeague(kod)]);

  const title = league ? t("leagueTitle", { name: league.name }) : "Fudaristo";
  const description = league
    ? t("leagueDescription", { name: league.name, members: t("leagueMembers", { count: league.members }) })
    : t("tagline");
  const image = `${getSiteUrl()}/api/og/liga/${encodeURIComponent(kod)}?lang=${locale}`;

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "Fudaristo",
      title,
      description,
      url: `${getSiteUrl()}${invitePath(league?.code ?? normalizeInviteCode(kod), locale)}`,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function LeaguePreviewPage({ params }: { params: Promise<{ locale: string; kod: string }> }) {
  const { locale, kod } = await params;
  setRequestLocale(locale);
  const league = await getLeague(kod);
  return (
    <p className="text-slate-400">
      <a href={invitePath(league?.code ?? normalizeInviteCode(kod), locale)}>{league?.name ?? "Fudaristo"}</a>
    </p>
  );
}
