import { notFound } from "next/navigation";

/**
 * Hvata sve adrese koje ne postoje ispod /[locale]/ i prosleđuje ih na
 * not-found.tsx — bez ovoga Next prikazuje svoj goli 404 bez zaglavlja i jezika.
 */
export default function CatchAll() {
  notFound();
}
