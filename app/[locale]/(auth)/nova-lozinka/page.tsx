import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./new-password-form";

/**
 * Ova stranica NIJE u PROTECTED_PREFIXES u middleware-u, i to je namerno:
 * korisnik ovamo stiže iz mejla, a middleware bi ga na osnovu odsustva sesije
 * poslao na /login pre nego što ruta /auth/potvrda stigne da upiše kolačiće.
 * Proveru radi sama stranica, posle razmene koda.
 */
export default async function NewPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="max-w-md mx-auto py-8">
        <h2 className="font-display text-2xl mb-2">{t("newPasswordTitle")}</h2>
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-5 text-sm">
          <p className="text-slate-300 leading-relaxed">{t("linkOnlyFromEmail")}</p>
          <Link
            href="/zaboravljena-lozinka"
            className="inline-block mt-4 text-gold-300 font-semibold"
          >
            {t("requestNewLink")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">{t("newPasswordTitle")}</h2>
      <p className="text-slate-400 text-sm mb-6">
        {t.rich("newPasswordFor", {
          email: user.email ?? "",
          b: (chunks) => <span className="text-chalk-50">{chunks}</span>,
        })}
      </p>
      <NewPasswordForm />
    </div>
  );
}
