import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/10 pb-4 dark:border-white/10">
        <Link href="/admin" className="text-lg font-semibold tracking-tight">
          ChefTreff Admin
        </Link>
        <nav className="flex gap-4 text-sm text-zinc-500">
          <Link href="/admin/personen" className="hover:text-foreground">
            Personen
          </Link>
          <Link href="/admin/vokabular" className="hover:text-foreground">
            Vokabular
          </Link>
          <Link href="/admin/dubletten" className="hover:text-foreground">
            Dubletten
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
