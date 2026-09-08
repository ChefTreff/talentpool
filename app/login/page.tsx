import { getI18n } from "@/lib/i18n";
import { safeNextPath } from "@/lib/areas";
import { AppHeader } from "@/components/layout/AppHeader";
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

  return (
    <>
      <AppHeader />
      <main
        id="content"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-6 py-16"
      >
        <LoginForm
          next={safeNext}
          authError={error === "auth" ? t.login.authError : undefined}
          labels={{
            title: t.login.title,
            lead: t.login.lead,
            emailLabel: t.login.emailLabel,
            emailPlaceholder: t.login.emailPlaceholder,
            submit: t.login.submit,
            sending: t.login.sending,
            sentTitle: t.login.sentTitle,
            sentBody: t.login.sentBody,
            required: t.common.required,
          }}
        />
      </main>
    </>
  );
}
