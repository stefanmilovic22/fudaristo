/** Boje težine meča: 1 lako (zeleno) … 5 teško (crveno). */
export const FDR_CLASS: Record<number, string> = {
  1: "bg-[#2FBF71] text-[#06210f]",
  2: "bg-[#8FD957] text-[#12260a]",
  3: "bg-[#B8C2D6] text-[#111b2e]",
  4: "bg-[#F08A3C] text-[#2a1200]",
  5: "bg-[#E2574C] text-white",
};

/** Pločica protivnika obojena težinom ("ARI (H)"). Bez težine je neutralna siva. */
export function FdrChip({
  label,
  difficulty,
  className = "",
  title,
}: {
  label: string;
  difficulty?: number;
  className?: string;
  title?: string;
}) {
  const cls = difficulty ? FDR_CLASS[difficulty] : "bg-navy-700 text-slate-300";
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center rounded-md font-extrabold leading-none whitespace-nowrap ${cls} ${className}`}
    >
      {label}
    </span>
  );
}
