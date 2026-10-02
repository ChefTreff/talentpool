import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ZugaengeListe, type Konto } from "./ZugaengeListe";
import { Geraetekonto } from "./Geraetekonto";
import { TeamEinladung } from "./TeamEinladung";
import { loadVocabMap, vgroup } from "@/lib/vocab";

export const dynamic = "force-dynamic";

const SEITE = 50;

/**
 * Zugänge (PORT4b): wer ein Konto hat, welche Rollen er trägt, und der Weg,
 * ihm den Zugang zu nehmen.
 *
 * **Gesperrt, nicht gelöscht.** „Alt-Systeme nur deaktivieren, nie löschen"
 * gilt auch für Menschen: wer geht, verliert den Zugang, nicht seine
 * Geschichte. Die Sperre ist ein Zeitstempel an der Person; `role_assignment`
 * wird nicht angefasst, damit das Entsperren genau wiederherstellt, was vorher
 * galt.
 */
export default async function ZugaengePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; seite?: string }>;
}) {
  const ctx = await requireAdminSection("access", "/admin/verwaltung/zugaenge");
  const { t, locale } = await getI18n("de");
  const { q, seite: seiteRoh } = await searchParams;
  const suche = (q ?? "").trim();
  const seite = Math.max(1, Number(seiteRoh ?? "1") || 1);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("access_accounts", {
    p_query: suche || null,
    p_limit: SEITE,
    p_offset: (seite - 1) * SEITE,
  });
  const konten = (data ?? []) as Konto[];
  // ADM-038: Gerätekonten gibt es nur für Editionen, die noch nicht vorbei sind.
  const heute = new Date().toISOString().slice(0, 10);
  const { data: editionen } = await supabase
    .from("event")
    .select("id, name")
    .eq("is_edition", true)
    .gte("end_date", heute)
    .order("start_date");
  // QS-056: Team-Rollen für die Einladung — ohne admin (das bleibt eine Entscheidung unter Verwaltung → Team).
  const [{ data: teamRollen }, vocab] = await Promise.all([supabase.rpc("team_role_keys"), loadVocabMap(supabase, locale)]);
  const rollenLabel = vgroup(vocab, "role");
  const rollen = ((teamRollen ?? []) as string[])
    .filter((r) => r !== "admin")
    .map((value) => ({ value, label: rollenLabel[value] ?? value }));

  return (
    <>
      <PageHeader word={t.admin.words.access} title={t.accessAdmin.title} description={t.accessAdmin.lead} />
      <TeamEinladung
        editionen={(editionen ?? []) as { id: string; name: string }[]}
        rollen={rollen}
        t={t.accessAdmin as Record<string, string>}
        common={{ cancel: t.common.cancel, required: t.common.required }}
        rpcMessages={t.rpc as Record<string, string>}
      />
      <Geraetekonto
        editionen={(editionen ?? []) as { id: string; name: string }[]}
        t={t.accessAdmin as Record<string, string>}
        common={{ save: t.common.save, required: t.common.required }}
        rpcMessages={t.rpc as Record<string, string>}
      />
      <ZugaengeListe
        konten={konten}
        suche={suche}
        seite={seite}
        proSeite={SEITE}
        /** Die eigene Kennung: der Knopf zum Selbstsperren gehört gar nicht erst hin. */
        selbst={ctx.personId}
        t={t.accessAdmin as Record<string, string>}
        common={{ cancel: t.common.cancel, save: t.common.save }}
        rpcMessages={t.rpc as Record<string, string>}
      />
    </>
  );
}
