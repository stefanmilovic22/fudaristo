"use client";

import { Children, useState, type ReactNode } from "react";

/**
 * Naslov sa dugmetom „Vidi sve” u gornjem desnom uglu, pa lista: prvih `limit`
 * stavki, a klik otvara ostale (uz sopstveni skrol kad je lista duga). Stavke
 * (<li>) se prave na serveru i prosleđuju kao children. Okvir kartice crta
 * pozivalac — ovde su samo zaglavlje i lista.
 */
export function ExpandableCard({
  title,
  children,
  limit = 5,
  moreLabel,
  lessLabel,
  titleClassName = "",
  headerClassName = "mb-3",
  listClassName = "",
  scrollWhenExpanded = false,
}: {
  title: string;
  children: ReactNode;
  limit?: number;
  moreLabel: string;
  lessLabel: string;
  titleClassName?: string;
  headerClassName?: string;
  listClassName?: string;
  /** Kad je otvorena, lista dobija sopstveni skrol umesto da produži stranicu. */
  scrollWhenExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const shown = expanded ? items : items.slice(0, limit);
  const canExpand = items.length > limit;

  return (
    <div>
      <div className={`flex items-baseline justify-between gap-3 ${headerClassName}`}>
        <h3 className={titleClassName}>{title}</h3>
        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0 text-xs font-bold text-gold-300 hover:text-gold-400 transition-colors"
          >
            {expanded ? lessLabel : moreLabel}
          </button>
        )}
      </div>
      <ul
        className={`${listClassName} ${
          expanded && scrollWhenExpanded ? "max-h-[60vh] overflow-y-auto overscroll-contain pr-2" : ""
        }`}
      >
        {shown}
      </ul>
    </div>
  );
}
