import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ACTION_ICON, ACTION_ICON_INLINE, actionClass, type ActionVariant } from "@/components/action-styles";

/** Link-dugme sa ikonicom: puna oznaka na webu, kratka na telefonu. */
export function ActionLink({
  href,
  icon: Icon,
  label,
  shortLabel,
  variant = "plain",
  badge,
  inline = false,
}: {
  href: string;
  icon: (p: { className?: string }) => ReactNode;
  label: string;
  shortLabel: string;
  variant?: ActionVariant;
  badge?: ReactNode;
  /** Ikonica levo od oznake i na telefonu (za zaglavlja stranica). */
  inline?: boolean;
}) {
  return (
    <Link href={href} className={actionClass(variant, inline)} aria-label={label}>
      <Icon className={inline ? ACTION_ICON_INLINE : ACTION_ICON} />
      {inline ? (
        <span>{label}</span>
      ) : (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      )}
      {badge && <span className="absolute -top-2 -right-1.5">{badge}</span>}
    </Link>
  );
}
