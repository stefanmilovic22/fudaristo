/**
 * Prikazuje se ODMAH pri prelasku na drugu stranicu, dok server sprema pravi
 * sadržaj (sve stranice se renderuju na serveru, jer zaglavlje zavisi od
 * prijave). Bez ovoga klik na meni izgleda kao da se ništa ne dešava.
 *
 * Namerno bez teksta (nema prevoda ni jezika ovde): samo tihi skelet.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse py-2">
      <div className="h-8 w-56 max-w-[70%] rounded-lg bg-navy-800" />
      <div className="h-4 w-80 max-w-[90%] rounded bg-navy-800/70 mt-3" />
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-navy-800 border border-navy-700" />
        ))}
      </div>
    </div>
  );
}
