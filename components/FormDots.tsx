import type { FormResult } from "@/lib/league-table";

const FORM_STYLE: Record<FormResult, string> = {
  W: "bg-pitch-500 text-navy-950",
  D: "bg-slate-500 text-chalk-50",
  L: "bg-danger-400 text-chalk-50",
};

/** Poslednjih pet rezultata kao obojeni kružići (isto kao u tabeli). */
export function FormDots({
  results,
  labels,
}: {
  results: FormResult[];
  labels: Record<FormResult, string>;
}) {
  if (results.length === 0) return null;
  return (
    <div className="flex gap-1">
      {results.map((r, i) => (
        <span
          key={i}
          className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-extrabold ${FORM_STYLE[r]}`}
        >
          {labels[r]}
        </span>
      ))}
    </div>
  );
}
