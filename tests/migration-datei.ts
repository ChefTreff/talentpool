import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Text einer Migration für Tests — unabhängig davon, ob sie noch als Vorschlag
 * (`supabase/migrations/vorschlag/<name>.sql`) liegt oder schon angewendet und auf
 * die Server-Version umbenannt ist (`supabase/migrations/<version>_<name>.sql`).
 *
 * Warum: Die Architektur-Session benennt Vorschläge beim Anwenden um. Ein Test,
 * der den Vorschlagspfad fest verdrahtet, ist danach rot — und mit ihm jedes Gate
 * auf `main` (24.09.2026, 0161/0162).
 */
export function migrationText(name: string): string {
  const vorschlag = join("supabase", "migrations", "vorschlag", `${name}.sql`);
  if (existsSync(vorschlag)) return readFileSync(vorschlag, "utf8");
  const dir = join("supabase", "migrations");
  const treffer = readdirSync(dir).filter((f) => /^\d{14}_/.test(f) && f.endsWith(`_${name}.sql`)).sort();
  const datei = treffer.at(-1);
  if (!datei) throw new Error(`Migration ${name} weder unter vorschlag/ noch angewendet gefunden`);
  return readFileSync(join(dir, datei), "utf8");
}
