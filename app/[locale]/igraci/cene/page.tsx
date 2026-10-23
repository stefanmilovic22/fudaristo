import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { byMove, getLastPriceChanges, type PriceChangeRow } from "@/lib/price-changes";
import { DataLoadError } from "@/components/DataLoadError";
import { ClubBadge } from "@/components/ClubBadge";
import { LocalTime } from "@/components/LocalTime";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "players" });
  return { title: `${t("priceChangesTitle")} — Fudaristo` };
}

/**
 * Promene cena iz poslednje izmene — javna stranica. Cene se rekalkulišu ručno
 * (admin), pa je ovo uvek „poslednja izmena“, ne tekući tok.
 */
export default async function PromeneCenaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("players");

  let data: Awaited<ReturnType<typeof getLastPriceChanges>>;
  try {
    data = await getLastPriceChanges();
  } catch (e) {
    console.error("[/igraci/cene]", e);
    return (
      <div>
        <h2 className="font-display text-2xl mb-4">{t("priceChangesTitle")}</h2>
        <DataLoadError whatKey="whatTable" error={{ message: (e as Error).message }} />
      </div>
    );
  }

  const risers = data.rows.filter((r) => r.newPrice > r.oldPrice).sort(byMove);
  const fallers = data.rows.filter((r) => r.newPrice < r.oldPrice).sort(byMove);
  // Izmene po oceni nemaju transfere (net = 0) — tada se umesto „Neto“ prikazuje veličina promene.
  const showNet = data.rows.some((r) => r.net !== 0);

  return (
    <div>
      <Link href="/igraci" className="text-slate-400 text-sm hover:text-chalk-50">
        ← {t("title")}
      </Link>
      <h2 className="font-display text-2xl mt-2 mb-1">{t("priceChangesTitle")}</h2>

      {data.changedAt === null ? (
        <p className="text-slate-400 mt-3">{t("priceChangesNone")}</p>
      ) : (
        <>
          <p className="text-slate-400 text-sm mb-1">
            {t("priceChangesLast")}{" "}
            <LocalTime iso={data.changedAt} options={{ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }} />
            {data.gameweekNumber !== null && <> · {t("priceChangesForGw", { number: data.gameweekNumber })}</>}
          </p>
          <p className="text-slate-500 text-xs mb-5">{t("priceChangesNote")}</p>

          <div className="grid gap-4 md:grid-cols-2">
            <Card title={`▲ ${t("risers")}`} tone="up" rows={risers} showNet={showNet} empty={t("priceChangesEmpty")} />
            <Card title={`▼ ${t("fallers")}`} tone="down" rows={fallers} showNet={showNet} empty={t("priceChangesEmpty")} />
          </div>
        </>
      )}
    </div>
  );
}

async function Card({
  title,
  tone,
  rows,
  showNet,
  empty,
}: {
  title: string;
  tone: "up" | "down";
  rows: PriceChangeRow[];
  showNet: boolean;
  empty: string;
}) {
  const t = await getTranslations("players");
  const color = tone === "up" ? "text-pitch-400" : "text-danger-400";
  return (
    <section className="bg-navy-800 border border-gold-400/50 rounded-xl overflow-hidden">
      <div className="bg-navy-700 border-b border-gold-400/30 px-4 py-2.5">
        <h3 className={`font-display text-sm uppercase tracking-wider ${color}`}>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-slate-400 text-sm">{empty}</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-slate-400 text-[11px] uppercase tracking-wide">
              <th className="text-left font-semibold py-2 pl-4 pr-2">{t("colPlayer")}</th>
              <th className="text-right font-semibold py-2 px-2">{t("colWas")}</th>
              <th className="text-right font-semibold py-2 px-2">{t("colNow")}</th>
              <th className="text-right font-semibold py-2 pl-2 pr-4">{showNet ? t("colNet") : t("colChange")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-t border-navy-700">
                <td className="py-2.5 pl-4 pr-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <ClubBadge short={r.clubShort} color={r.clubColor} size={22} />
                    <span className="font-semibold truncate">{r.name}</span>
                  </span>
                </td>
                <td className="py-2.5 px-2 text-right tabular-nums text-slate-400">{r.oldPrice.toFixed(1)}</td>
                <td className={`py-2.5 px-2 text-right tabular-nums font-bold ${color}`}>
                  {tone === "up" ? "▲" : "▼"} {r.newPrice.toFixed(1)}
                </td>
                <td className="py-2.5 pl-2 pr-4 text-right tabular-nums text-slate-400">
                  {showNet ? (
                    <>
                      {r.net > 0 ? "+" : ""}
                      {r.net}
                    </>
                  ) : (
                    <>
                      {r.newPrice > r.oldPrice ? "+" : "−"}
                      {Math.abs(r.newPrice - r.oldPrice).toFixed(1)}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
