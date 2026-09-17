import { getI18n } from "@/lib/i18n";
import { safeNextPath } from "@/lib/areas";
import { AppHeader } from "@/components/layout/AppHeader";
import { BrandBackdrop } from "@/components/layout/BrandBackdrop";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = safeNextPath(next, "");
  const { t } = await getI18n();

  // `error` kommt aus der URL. Ein Zugriff `t.login.errors[error]` würde bei
  // `?error=__proto__` oder `?error=constructor` die Prototypkette treffen und
  // ein Objekt an die Client-Komponente reichen — deshalb nur eigene Schlüssel.
  const authError = error
    ? Object.hasOwn(t.login.errors, error)
      ? t.login.errors[error as keyof typeof t.login.errors]
      : t.login.errors.auth
    : undefined;

  return (
    <>
      <AppHeader />
      {/* Einer der drei Marken-Momente: Navy über die ganze Seite, Formen
          dahinter, ein Highlight-Wort. Sobald man angemeldet ist, hört das
          auf — Arbeitsflächen sind hell (Skill /portal-design). */}
      <main
        id="content"
        className="relative isolate flex flex-1 flex-col bg-navy px-6 py-16"
      >
        <BrandBackdrop />
        <div className="mx-auto w-full max-w-[640px]">
        <LoginForm
          next={safeNext}
          authError={authError}
          labels={{
            eyebrow: t.login.eyebrow,
            titleLead: t.login.titleLead,
            titleHighlight: t.login.titleHighlight,
            lead: t.login.lead,
            emailLabel: t.login.emailLabel,
            emailPlaceholder: t.login.emailPlaceholder,
            submit: t.login.submit,
            sending: t.login.sending,
            sentTitle: t.login.sentTitle,
            sentBody: t.login.sentBody,
            required: t.common.required,
            helpTitle: t.login.helpTitle,
            helpBody: t.login.helpBody,
            helpMailbox: t.login.helpMailbox,
          }}
        />
        </div>
      </main>
    </>
  );
}
