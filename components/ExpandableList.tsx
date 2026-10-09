"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * Lista koja prikazuje prvih `limit` stavki, a ostale otvara klikom.
 * Stavke (<li>) se prave na serveru i prosleđuju kao children.
 */
export function ExpandableList({
  children,
  limit = 5,
  moreLabel,
  lessLabel,
  className = "",
}: {
  children: ReactNode;
  limit?: number;
  /** Već prevedeno i sa upisanim brojem preostalih ("Prikaži sve (4 više)"). */
  moreLabel: string;
  lessLabel: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const shown = expanded ? items : items.slice(0, limit);
  const hidden = items.length - limit;

  return (
    <>
      <ul className={className}>{shown}</ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 w-full text-center text-xs font-bold text-gold-300 hover:text-gold-400 py-2 rounded-lg hover:bg-navy-700/40 transition-colors"
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </>
  );
}
