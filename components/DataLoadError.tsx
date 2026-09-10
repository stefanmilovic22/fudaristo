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
export function DataLoadError({
  what,
  error,
}: {
  /** Šta se učitavalo, u genitivu — npr. "rasporeda". */
  what: string;
  error: { message: string; code?: string; hint?: string | null; details?: string | null } | null;
}) {
  return (
    <div className="bg-navy-800 border border-danger-400/40 rounded-lg p-5 text-sm max-w-2xl">
      <p className="text-danger-400 font-semibold mb-2">Učitavanje {what} nije uspelo.</p>

      {error ? (
        <>
          <p className="text-slate-300 leading-relaxed">{error.message}</p>
          {(error.code || error.hint || error.details) && (
            <dl className="mt-3 text-xs text-slate-400 flex flex-col gap-1">
              {error.code && (
                <div>
                  <dt className="inline font-semibold">Kod: </dt>
                  <dd className="inline">{error.code}</dd>
                </div>
              )}
              {error.details && (
                <div>
                  <dt className="inline font-semibold">Detalji: </dt>
                  <dd className="inline">{error.details}</dd>
                </div>
              )}
              {error.hint && (
                <div>
                  <dt className="inline font-semibold">Savet: </dt>
                  <dd className="inline">{error.hint}</dd>
                </div>
              )}
            </dl>
          )}
        </>
      ) : (
        <p className="text-slate-300">Nepoznata greška — pogledaj log na Vercel-u.</p>
      )}

      <p className="text-slate-500 text-xs mt-4 leading-relaxed">
        Ako poruka pominje vezu između tabela (<code>relationship</code>,{" "}
        <code>PGRST200</code>), Supabase-u je zastarela shema posle migracije. Pokreni u SQL
        Editor-u: <code className="text-slate-400">notify pgrst, &apos;reload schema&apos;;</code>
      </p>
    </div>
  );
}
