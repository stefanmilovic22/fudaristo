"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { EmptyState } from "@/components/EmptyState";
import { reportClientError } from "@/lib/report-client-error";

/**
 * Greška pri prikazu stranice — umesto bele ekrana korisnik dobija poruku i
 * dugme „Pokušaj ponovo". Greška se usput javlja i nama (lib/monitor.ts).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");

  useEffect(() => {
    reportClientError(error);
  }, [error]);

  const btn = "text-sm font-bold px-4 py-2 rounded-lg transition-colors";
  return (
    <div className="max-w-xl mx-auto py-8">
      <EmptyState
        icon="chart"
        title={t("errorTitle")}
        body={t("errorBody")}
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <button type="button" onClick={reset} className={`${btn} bg-gold-400 text-navy-950 hover:bg-gold-300`}>
              {t("retry")}
            </button>
            <Link href="/" className={`${btn} border border-navy-600 text-slate-300 hover:text-chalk-50`}>
              {t("goHome")}
            </Link>
          </div>
        }
      />
      {error.digest && (
        <p className="text-center text-xs text-slate-500 mt-3">
          {t("errorCode")}: {error.digest}
        </p>
      )}
    </div>
  );
}
