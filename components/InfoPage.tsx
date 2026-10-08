import type { ReactNode } from "react";
import { InfoShell } from "@/components/InfoShell";

export type InfoSection = { title: string; body: string };

/**
 * Zajednički izgled za stranice „O nama”, „Kontakt” i „Privatnost”: naslov,
 * uvodni red i odeljci. Tekst dolazi iz prevoda (messages/*.json); pasusi u
 * `body` se razdvajaju praznim redom (\n\n).
 */
export function InfoPage({
  title,
  lead,
  sections,
  children,
  footnote,
}: {
  title: string;
  lead: string;
  sections: InfoSection[];
  /** Dodatni sadržaj ispod uvodnog reda (npr. dugme sa email adresom). */
  children?: ReactNode;
  footnote?: string;
}) {
  return (
    <InfoShell>
      <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">{title}</h1>
      <p className="text-slate-300 mt-3 leading-relaxed">{lead}</p>

      {children && <div className="mt-5">{children}</div>}

      <div className="mt-6 flex flex-col gap-4">
        {sections.map((s) => (
          <section key={s.title} className="bg-navy-800 border border-navy-700 rounded-xl p-4 sm:p-5">
            <h2 className="font-display text-lg sm:text-xl mb-2">{s.title}</h2>
            <div className="flex flex-col gap-2 text-sm sm:text-[15px] text-slate-300 leading-relaxed">
              {s.body.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      {footnote && <p className="text-xs text-slate-500 mt-6">{footnote}</p>}
    </InfoShell>
  );
}
