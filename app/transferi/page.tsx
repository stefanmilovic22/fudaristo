import { redirect } from "next/navigation";

/**
 * Transferi više nemaju svoju stranicu — ceo tok (× → izbor zamene → potvrda)
 * živi na "Moj tim", kao na FPL-u. Ruta ostaje samo da stari linkovi i
 * obeleživači ne vode u 404.
 */
export default function TransferiPage() {
  redirect("/moj-tim");
}
