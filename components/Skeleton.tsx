import type { CSSProperties, ReactNode } from "react";

/**
 * Gradivni blokovi za loading.tsx — siva „kostur" slika stranice koja stiže.
 * Oblici prate prave stranice (kartica sa trakom, redovi, teren), da se
 * raspored ne pomera kad stigne sadržaj. Bez teksta: nema prevoda ni jezika.
 */
export function SkeletonPage({ children }: { children: ReactNode }) {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse py-2">
      {children}
    </div>
  );
}

export function Bar({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`rounded-md bg-navy-700/70 ${className}`} style={style} />;
}

export function SkeletonTitle({ sub = true }: { sub?: boolean }) {
  return (
    <div className="mb-5">
      <Bar className="h-8 w-56 max-w-[70%] !rounded-lg bg-navy-800" />
      {sub && <Bar className="h-4 w-80 max-w-[90%] mt-3 bg-navy-800/70" />}
    </div>
  );
}

/** Kartica sa trakom naslova, kao prave kartice sajta. */
export function SkeletonCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-navy-800 border border-gold-400/30 rounded-xl overflow-hidden ${className}`}>
      <div className="bg-navy-700/80 border-b border-gold-400/20 px-4 py-3">
        <Bar className="h-3.5 w-32 bg-navy-600/60" />
      </div>
      {children}
    </div>
  );
}

export function SkeletonRows({ count = 8, avatar = true }: { count?: number; avatar?: boolean }) {
  return (
    <ul>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3 border-t border-navy-700 first:border-t-0">
          {avatar && <Bar className="w-7 h-7 !rounded-full shrink-0" />}
          <Bar className="h-4 flex-1 max-w-[220px]" />
          <Bar className="h-4 w-10 ml-auto" />
          <Bar className="h-4 w-10" />
        </li>
      ))}
    </ul>
  );
}

/** Teren: tamni okvir sa zelenom podlogom, kao na Moj klub i stranici tima. */
export function SkeletonPitch({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-xl bg-[#0A0D12] ring-1 ring-gold-400/30 p-2 ${className}`}>
      <div className="h-12 sm:h-16" />
      <div className="rounded-lg bg-[#3b6f3a]/40 h-[420px] sm:h-[520px] grid grid-rows-4 place-items-center py-6">
        {[1, 4, 4, 2].map((n, i) => (
          <div key={i} className="flex gap-3 sm:gap-4">
            {Array.from({ length: n }).map((_, j) => (
              <Bar key={j} className="w-14 sm:w-[78px] h-16 sm:h-20 !rounded-lg bg-navy-700/60" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
