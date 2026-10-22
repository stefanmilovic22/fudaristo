import { getTranslations } from "next-intl/server";
import { LeagueCard, SiteCard, OG_SIZE } from "@/lib/og/cards";
import { renderPng } from "@/lib/og/render";
import { normalizeLang } from "@/lib/share";
import { normalizeInviteCode, INVITE_CODE_LENGTH } from "@/lib/leagues";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Slika pregleda linka pozivnice u privatnu ligu. Ko ima šifru sme da vidi ime
 * lige i broj članova (isto kao `league_preview` posle prijave) — a robot za
 * preglede nema nalog, pa se čita servisnim ključem. Šifra se NE crta na slici.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params;
  const locale = normalizeLang(new URL(request.url).searchParams.get("lang"));
  const t = await getTranslations({ locale, namespace: "og" });

  const fallback = () => renderPng(<SiteCard title="FUDARISTO" tagline={t("tagline")} />, OG_SIZE);
  const code = normalizeInviteCode(kod);
  if (code.length !== INVITE_CODE_LENGTH) return fallback();

  let league: { id: string; name: string } | null = null;
  let members = 0;
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from("leagues")
      .select("id, name")
      .eq("invite_code", code)
      .eq("is_global", false)
      .maybeSingle();
    league = data;
    if (league) {
      const { count } = await supabase
        .from("league_memberships")
        .select("user_id", { count: "exact", head: true })
        .eq("league_id", league.id);
      members = count ?? 0;
    }
  } catch (e) {
    console.error("[og/liga]", e instanceof Error ? e.message : e);
    return fallback();
  }
  if (!league) return fallback();

  return renderPng(
    <LeagueCard
      text={{
        tagline: t("tagline"),
        badge: t("leagueBadge"),
        name: league.name,
        members: t("leagueMembers", { count: members }),
        cta: t("leagueCta"),
      }}
    />,
    OG_SIZE
  );
}
