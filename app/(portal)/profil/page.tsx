import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Sicherstellen, dass eine Person existiert bzw. die migrierte Person geclaimed ist.
  await supabase.rpc("claim_or_create_person");

  const { data: person } = await supabase
    .from("person")
    .select("first_name, last_name, occupation_status, study_field, country")
    .maybeSingle();

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Mein Profil</h1>
      <p className="text-sm text-zinc-500">Angemeldet als {user.email}</p>
      <pre className="overflow-x-auto rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
        {JSON.stringify(person, null, 2)}
      </pre>
      <p className="text-sm text-zinc-500">
        Onboarding-Formular & Bearbeitung folgen in P1.
      </p>
    </main>
  );
}
