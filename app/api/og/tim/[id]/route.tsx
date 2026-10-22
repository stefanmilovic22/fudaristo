import { getTranslations } from "next-intl/server";
import { TeamCard, SiteCard, OG_SIZE } from "@/lib/og/cards";
import { renderPng } from "@/lib/og/render";
import { normalizeLang, UUID_RE } from "@/lib/share";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadTeamShare } from "@/lib/team-share";

/**
 * Slika pregleda linka tima (WhatsApp, Viber, Facebook…). JAVNA je — poziva je
 * robot za preglede koji nema nalog — pa prikazuje samo ime tima, poene, rang
 * i boje dresova iz poslednjeg zaključanog kola. Bez imena igrača: sastav
 * ostaje iza prijave (vidi „Podeli tim", koji traži nalog).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = normalizeLang(new URL(request.url).searchParams.get("lang"));
  const t = await getTranslations({ locale, namespace: "og" });

  const fallback = () => renderPng(<SiteCard title="FUDARISTO" tagline={t("tagline")} />, OG_SIZE);
  if (!UUID_RE.test(id)) return fallback();

  let data;
  try {
    data = await loadTeamShare(createServiceRoleClient(), id);
  } catch (e) {
    console.error("[og/tim]", e instanceof Error ? e.message : e);
    return fallback();
  }
  if (!data) return fallback();

  const rankOf =
    data.rank !== null && data.managers !== null ? t("rankOf", { rank: data.rank, managers: data.managers }) : null;
  const subtitle = [data.clubName, rankOf].filter(Boolean).join(" · ") || t("tagline");

  return renderPng(
    <TeamCard
      rows={data.rows}
      text={{
        tagline: t("tagline"),
        teamName: data.teamName,
        subtitle,
        totalLabel: t("pointsTotal"),
        totalValue: String(data.totalPoints),
        gwLabel: data.gameweek?.points != null ? t("pointsGw") : null,
        gwValue: data.gameweek?.points != null ? String(data.gameweek.points) : null,
      }}
    />,
    OG_SIZE
  );
}
