import { flagUrl } from "@/lib/country";

/**
 * Zastava države kao slika (flagcdn). Emotikone zastava Windows ne crta (vide se
 * samo slova „GR"), pa se koriste prave slike; 2x verzija za oštre ekrane.
 */
export function Flag({ code, name, height = 14 }: { code: string; name?: string; height?: number }) {
  const src = flagUrl(code, 20);
  if (!src) return null;
  const width = Math.round((height * 4) / 3);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={`${flagUrl(code, 40)} 2x`}
      width={width}
      height={height}
      alt={name ?? code}
      title={name ?? code}
      loading="lazy"
      className="inline-block shrink-0 rounded-[2px] ring-1 ring-black/20 object-cover"
      style={{ width, height }}
    />
  );
}
