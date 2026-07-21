import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: isStaff } = await supabase.rpc("is_staff");

  if (!isStaff) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Kein Zugriff</h1>
        <p className="mt-2 text-zinc-500">
          Dieser Bereich ist dem ChefTreff-Team vorbehalten.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-2 text-zinc-500">
        Personen-Liste, Dubletten-Queue und Vokabular-Pflege folgen in P2.
      </p>
    </main>
  );
}
