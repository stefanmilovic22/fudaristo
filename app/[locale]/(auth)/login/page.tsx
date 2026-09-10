import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-6">{t("loginTitle")}</h2>
      <LoginForm />
    </div>
  );
}
