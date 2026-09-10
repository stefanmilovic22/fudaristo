import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("register");

  const supabase = await createClient();
  const { data: clubs } = await supabase
    .from("clubs")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">{t("title")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("subtitle")}</p>
      {(!clubs || clubs.length === 0) && (
        <p className="text-danger-400 text-sm mb-4">{t("noClubsWarning")}</p>
      )}
      <RegisterForm clubs={clubs ?? []} />
    </div>
  );
}
