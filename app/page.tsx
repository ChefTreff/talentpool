import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-24">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          ChefTreff
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Talent-CRM</h1>
        <p className="mt-4 text-lg text-zinc-600 dark:text-zinc-400">
          Ein Profil, ein Login — formatübergreifend. Deine Daten einmal pflegen
          und über alle ChefTreff-Formate hinweg aktuell halten.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/login"
          className="rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background"
        >
          Anmelden
        </Link>
        <Link
          href="/profil"
          className="rounded-full border border-black/10 px-5 py-3 text-sm font-medium dark:border-white/15"
        >
          Mein Profil
        </Link>
        <Link
          href="/admin"
          className="rounded-full border border-black/10 px-5 py-3 text-sm font-medium dark:border-white/15"
        >
          Admin
        </Link>
      </div>
    </main>
  );
}
