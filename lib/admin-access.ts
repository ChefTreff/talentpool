import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEnterAdminSection, type AdminSectionKey } from "@/lib/admin-sections";

/**
 * Ausnahmen zur Abschnitts-Vorgabe (ADM-053, Konrad 24.09.2026).
 *
 * Die Vorgabe steht in `lib/admin-sections.ts`; welche Rolle welchen Abschnitt
 * öffnet, ist damit im Code nachlesbar. Konrad muss davon abweichen können, ohne
 * einen Chat zu brauchen — dafür `admin_section_override` in der Datenbank.
 * Zwei Quellen für dieselbe Frage wären ein Fehler; deshalb ist die eine die
 * **Vorgabe** und die andere die **Ausnahme**, und nur hier werden sie
 * übereinandergelegt.
 *
 * Reihenfolge: Person schlägt Rolle, Rolle schlägt Vorgabe. `admin` sieht alles
 * und bekommt gar keine Ausnahmen geliefert — sonst könnte Konrad sich den Weg
 * zurück zum Rollen-Bereich abschalten.
 *
 * `cache()` pro Anfrage: Navigation und Seiten-Gate fragen dieselbe Antwort ab,
 * nicht zweimal die Datenbank.
 */
export const adminSectionOverrides = cache(async (): Promise<Map<string, boolean>> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_admin_section_overrides");
  if (error) {
    // Eine Ausnahme, die nicht gelesen werden kann, darf nichts öffnen und
    // nichts schliessen: die Vorgabe gilt weiter. Ein harter Fehler würde jede
    // Admin-Seite mitnehmen, auch die, an denen keine Ausnahme hängt.
    console.error("[admin] Ausnahmen nicht gelesen:", error.message);
    return new Map();
  }
  const rows = (data ?? []) as { section: string; allowed: boolean; quelle: string }[];
  const out = new Map<string, boolean>();
  // Die RPC liefert Person- und Rollenzeilen; die Person gewinnt. Sie filtert
  // Rollenzeilen bereits heraus, wo eine Personenzeile existiert — die Schleife
  // hier ist die zweite Sicherung, falls das je auseinanderfällt.
  for (const r of rows) if (r.quelle === "role" && !out.has(r.section)) out.set(r.section, r.allowed);
  for (const r of rows) if (r.quelle === "person") out.set(r.section, r.allowed);
  return out;
});

/** Öffnet dieses Rollenset den Abschnitt — Vorgabe plus Ausnahmen? */
export async function mayEnterAdminSection(
  section: AdminSectionKey,
  roles: readonly string[],
): Promise<boolean> {
  if (roles.includes("admin")) return true;
  const ausnahme = (await adminSectionOverrides()).get(section);
  return ausnahme ?? canEnterAdminSection(section, roles);
}
