import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/EmptyState";

/** 404 unutar sajta: isto zaglavlje i jezik, sa putem nazad. */
export default async function NotFound() {
  const t = await getTranslations("errors");
  const btn = "text-sm font-bold px-4 py-2 rounded-lg transition-colors";
  return (
    <div className="max-w-xl mx-auto py-8">
      <EmptyState
        icon="search"
        title={t("notFoundTitle")}
        body={t("notFoundBody")}
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <Link href="/" className={`${btn} bg-gold-400 text-navy-950 hover:bg-gold-300`}>
              {t("goHome")}
            </Link>
            <Link href="/moj-tim" className={`${btn} border border-navy-600 text-slate-300 hover:text-chalk-50`}>
              {t("goMyTeam")}
            </Link>
          </div>
        }
      />
    </div>
  );
}
