/**
 * Supabase vraća najviše 1000 redova po zahtevu (podešavanje "Max rows"), i to
 * ĆUTKE — bez greške i bez naznake da je odsečeno. Svaki upit koji sme da
 * preraste tu granicu (squads, statistika, rang lista) mora da ide ovuda.
 *
 * `order` u pozivaocu je OBAVEZAN i mora biti stabilan — bez njega `range()`
 * nema definisan redosled, pa se strane mogu preklopiti ili preskočiti redove.
 */
export const SUPABASE_PAGE_SIZE = 1000;

export async function selectAllPages<T>(
  label: string,
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await build(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < SUPABASE_PAGE_SIZE) return out;
  }
}
