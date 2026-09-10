import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">{t("forgotTitle")}</h2>
      <p className="text-slate-400 text-sm mb-6">{t("forgotIntro")}</p>
      <ForgotPasswordForm />
    </div>
  );
}
