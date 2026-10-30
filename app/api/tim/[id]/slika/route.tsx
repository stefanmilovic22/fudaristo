import { getTranslations } from "next-intl/server";
import { ShareCard, SHARE_SIZE } from "@/lib/og/cards";
import { renderPng } from "@/lib/og/render";
import { normalizeLang, UUID_RE } from "@/lib/share";
import { getSiteUrl } from "@/lib/site-url";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { loadTeamShare } from "@/lib/team-share";

// Izrada slike traje nekoliko sekundi na sporijim serverima; podrazumevano
// ograničenje bi je preseklo i telefon bi dobio grešku.
export const maxDuration = 30;

/**
 * „Podeli tim" — slika 1080×1350 sa postavom iz poslednjeg zaključanog kola.
 * Traži prijavu, jer prikazuje imena igrača (kao i stranica /tim/[id], koja je
 * iza prijave). Podaci se čitaju servisnim ključem samo zato što RLS ne dozvoljava
 * čitanje tuđih redova; ko dobija odgovor odlučuje provera prijave ovde.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!UUID_RE.test(id)) return new Response("Not found", { status: 404 });

  const query = new URL(request.url).searchParams;
  const locale = normalizeLang(query.get("lang"));
  // mode=current: sastav za naredno kolo bez poena („Moj klub“) — to je tajna do
  // roka, pa samo vlasnik tima sme da ga traži. Bez toga: poslednje zaključano
  // kolo sa poenima (iz lige / sa stranice tima).
  const current = query.get("mode") === "current";
  if (current && user.id !== id) return new Response("Forbidden", { status: 403 });
  const t = await getTranslations({ locale, namespace: "og" });

  const data = await loadTeamShare(createServiceRoleClient(), id, { current });
  if (!data) return new Response("Not found", { status: 404 });

  const gwLine = data.gameweek
    ? current
      ? t("squadFor", { number: data.gameweek.number })
      : data.gameweek.points != null
      ? t("gwLine", { number: data.gameweek.number, points: data.gameweek.points })
      : t("gwLineNoPoints", { number: data.gameweek.number })
    : null;
  const rankLine =
    data.rank !== null && data.managers !== null ? t("rankOf", { rank: data.rank, managers: data.managers }) : null;

  // Fotografije dresova (ako ih klub ima) se preuzimaju ovde i ugrađuju kao data
  // URI — Satori ih inače preuzima sam i cela slika pada ako jedna ne stigne.
  const origin = new URL(request.url).origin;
  const photos = await fetchPhotos(
    [...new Set(data.rows.flat().map((d) => d.photoUrl).filter((u): u is string => Boolean(u)))],
    origin
  );

  return renderPng(
    <ShareCard
      photos={photos}
      rows={data.rows}
      text={{
        tagline: t("tagline"),
        teamName: data.teamName,
        gwLine,
        rankLine,
        url: getSiteUrl().replace(/^https?:\/\//, ""),
        totalValue: String(data.totalPoints),
        totalLabel: t("pointsTotal"),
        noSquad: t("noSquad"),
      }}
    />,
    SHARE_SIZE,
    "private"
  );
}

async function fetchPhotos(urls: string[], origin: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    urls.map(async (url) => {
      try {
        const abs = url.startsWith("/") ? `${origin}${url}` : url;
        if (!/^https?:\/\//.test(abs)) return;
        const res = await fetch(abs, { signal: AbortSignal.timeout(4000) });
        const type = res.headers.get("content-type") ?? "";
        if (!res.ok || !/^image\/(png|jpe?g)/.test(type)) return;
        out[url] = `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
      } catch {
        // bez fotografije ostaje vektorski dres
      }
    })
  );
  return out;
}
