import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Zaboravljena lozinka — Fudaristo" };

export default function ForgotPasswordPage() {
  return (
    <div className="max-w-md mx-auto py-8">
      <h2 className="font-display text-2xl mb-2">Zaboravljena lozinka</h2>
      <p className="text-slate-400 text-sm mb-6">
        Upiši email sa kojim si se registrovao. Poslaćemo ti link za postavljanje nove lozinke.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
