import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { ACTION_ICON, actionClass, type ActionVariant } from "@/components/action-styles";

/** Link-dugme sa ikonicom: puna oznaka na webu, kratka na telefonu. */
export function ActionLink({
  href,
  icon: Icon,
  label,
  shortLabel,
  variant = "plain",
  badge,
}: {
  href: string;
  icon: (p: { className?: string }) => ReactNode;
  label: string;
  shortLabel: string;
  variant?: ActionVariant;
  badge?: ReactNode;
}) {
  return (
    <Link href={href} className={actionClass(variant)} aria-label={label}>
      <Icon className={ACTION_ICON} />
      <span className="sm:hidden">{shortLabel}</span>
      <span className="hidden sm:inline">{label}</span>
      {badge && <span className="absolute -top-2 -right-1.5">{badge}</span>}
    </Link>
  );
}
