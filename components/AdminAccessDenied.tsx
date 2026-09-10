import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AdminAccess } from "@/lib/admin-guard";

/**
 * Prikazuje se umesto admin panela kad korisnik nema prava. Ranije je ovo bilo
 * tiho `redirect("/moj-tim")` — korisnik bi kliknuo /admin i završio na svom
 * timu bez ijedne reči objašnjenja, pa je izgledalo kao da admin panel ne
 * postoji uopšte.
 *
 * SQL je namerno ispisan: `is_admin` niko ne može sam sebi da postavi
 * (migracija 003 oduzima UPDATE pravo na tu kolonu), pa je SQL Editor jedini
 * način — i to je lako zaboraviti mesecima posle setup-a.
 */
export async function AdminAccessDenied({
  access,
}: {
  access: Extract<AdminAccess, { ok: false }>;
}) {
  const t = await getTranslations("adminDenied");
  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl mb-1">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("noAccess")}</p>

      {access.reason === "anon" && (
        <p className="text-slate-300 text-sm">
          {t("notLoggedIn")}{" "}
          <Link href="/login?redirect=/admin" className="text-gold-300 font-semibold">
            {t("logIn")}
          </Link>{" "}
          {t("thenRetry")}
        </p>
      )}

      {access.reason === "no_profile" && (
        <p className="text-slate-300 text-sm">{t("noProfile")}</p>
      )}

      {access.reason === "not_admin" && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
          <p className="text-slate-300">{t("accountNoAdmin", { team: access.teamName ?? "—" })}</p>
          <p className="text-slate-300 mt-4">{t("setOnce")}</p>
          <pre className="mt-2 bg-navy-950 border border-navy-700 rounded-md p-3 text-xs overflow-x-auto text-slate-300">
            {`update users set is_admin = true\n where team_name = '${access.teamName ?? "Tvoj Tim"}';`}
          </pre>
          <p className="text-slate-400 mt-4 text-xs">{t("afterRefresh")}</p>
        </div>
      )}

      <p className="mt-6 text-sm">
        <Link href="/moj-tim" className="text-slate-400 hover:text-chalk-50">
          ← {t("backToMyClub")}
        </Link>
      </p>
    </div>
  );
}
