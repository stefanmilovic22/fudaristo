/**
 * Prikaz stvarne greške iz Supabase-a.
 *
 * Ranije je svaka od ovih stranica na grešku ispisivala samo "ne može se
 * učitati, proveri da je schema.sql pokrenut". To je pogađanje uzroka, a ne
 * poruka — pravi razlog (istekao ključ, nedostupna tabela, PostgREST ne vidi
 * vezu između tabela) ostajao je nevidljiv i u pregledaču i u logu.
 *
 * `code` i `hint` dolaze iz PostgREST-a i najčešće odmah kažu šta je.
 * Prikazuju se na stranici namerno: ovo je greška infrastrukture koju vidi
 * vlasnik aplikacije, a poruka ne sadrži ni ključeve ni podatke korisnika.
 */
import { getTranslations } from "next-intl/server";

export async function DataLoadError({
  whatKey,
  error,
}: {
  /** Ključ iz errors.* koji imenuje šta se učitavalo — npr. "whatFixtures". */
  whatKey: "whatFixtures" | "whatLeague" | "whatStats";
  error: { message: string; code?: string; hint?: string | null; details?: string | null } | null;
}) {
  const t = await getTranslations("errors");
  return (
    <div className="bg-navy-800 border border-danger-400/40 rounded-lg p-5 text-sm max-w-2xl">
      <p className="text-danger-400 font-semibold mb-2">{t("loadFailed", { what: t(whatKey) })}</p>
      <p className="text-slate-300 leading-relaxed">{t("friendly")}</p>

      {/* Sirova poruka/kod/hint idu iza <details> — korisno vlasniku aplikacije
          za dijagnozu, ali običnom posetiocu ne treba stack trace da mu upadne
          u oči čim Supabase zaikavi. Native <details> je dovoljan, bez JS-a. */}
      <details className="mt-3 group">
        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300 select-none">
          {t("showTechnical")}
        </summary>
        <div className="mt-2">
          {error ? (
            <>
              <p className="text-slate-300 leading-relaxed">{error.message}</p>
              {(error.code || error.hint || error.details) && (
                <dl className="mt-3 text-xs text-slate-400 flex flex-col gap-1">
                  {error.code && (
                    <div>
                      <dt className="inline font-semibold">{t("code")}: </dt>
                      <dd className="inline">{error.code}</dd>
                    </div>
                  )}
                  {error.details && (
                    <div>
                      <dt className="inline font-semibold">{t("details")}: </dt>
                      <dd className="inline">{error.details}</dd>
                    </div>
                  )}
                  {error.hint && (
                    <div>
                      <dt className="inline font-semibold">{t("hint")}: </dt>
                      <dd className="inline">{error.hint}</dd>
                    </div>
                  )}
                </dl>
              )}
            </>
          ) : (
            <p className="text-slate-300">{t("unknown")}</p>
          )}

          <p className="text-slate-500 text-xs mt-4 leading-relaxed">{t("staleSchema")}</p>
        </div>
      </details>
    </div>
  );
}
