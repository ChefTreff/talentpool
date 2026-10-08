import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { aenderungen, aktionsName, kurzfassung, leseVon, rpcVon } from "@/lib/audit/anzeige";
import { ProtokollFilter } from "./ProtokollFilter";
import { ProtokollListe, type ProtokollZeile } from "./ProtokollListe";

export const dynamic = "force-dynamic";

type Zeile = {
  id: number; created_at: string; action: string;
  object_type: string | null; object_id: string | null;
  actor_person_id: string | null; actor_name: string | null;
  vorher: unknown; nachher: unknown; total: number;
};
type Filter = {
  actions: string[]; object_types: string[]; actors: { id: string; name: string }[];
};

const SEITE = 50;

/**
 * Das Protokoll der Admin-Aktionen (PORT4a, ADM-095).
 *
 * „Audit-Log für Admin-Aktionen" steht unter „nicht verhandelbar". Geschrieben
 * wurde es seit Welle 1; angesehen hat es bisher niemand, ausser über die
 * Datenbank — eine Zusage, die nur auf dem Papier stand.
 *
 * ADM-095 (Konrad, 08.10.): (a) die Auswahl gilt sofort, ohne „Filtern“-Knopf;
 * (b) Aktionen mit **Anzeigenamen** statt Systemnamen; (c) Umschalter „durch
 * Personen / durch das System“ — über 1800 Einträge, die meisten vom System;
 * (d) Vorher/Nachher nicht als grosse Felder, sondern als Feldliste im Overlay.
 *
 * **Kein Export.** Die Einträge tragen Vorher- und Nachher-Stände aus dem
 * ganzen System; eine CSV davon wäre eine Kopie der Datenbank in einer Tabelle.
 * Wer etwas belegen muss, zeigt den Eintrag.
 *
 * Filter und Seite stehen in der Adresszeile: so lässt sich ein Fund
 * weiterschicken, und der Rücken-Knopf des Browsers tut, was er soll.
 */
export default async function ProtokollPage({
  searchParams,
}: {
  searchParams: Promise<{ von?: string; aktion?: string; objekt?: string; person?: string; ab?: string; bis?: string; seite?: string }>;
}) {
  await requireAdminSection("auditLog", "/admin/verwaltung/protokoll");
  const { t, locale } = await getI18n();
  const q = await searchParams;
  const seite = Math.max(1, Number(q.seite ?? "1") || 1);
  const von = leseVon(q.von);
  const supabase = await createSupabaseServerClient();

  const [eintraege, filter] = await Promise.all([
    supabase.rpc("audit_log_admin", {
      p_action: q.aktion || null,
      p_object_type: q.objekt || null,
      p_actor: q.person || null,
      p_by: rpcVon(von),
      p_from: q.ab ? new Date(q.ab).toISOString() : null,
      p_to: q.bis ? new Date(q.bis).toISOString() : null,
      p_limit: SEITE,
      p_offset: (seite - 1) * SEITE,
    }),
    supabase.rpc("audit_log_filters"),
  ]);
  const zeilen = (eintraege.data ?? []) as Zeile[];
  const f = (filter.data ?? { actions: [], object_types: [], actors: [] }) as Filter;
  const gesamt = zeilen[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / SEITE));

  const aktionen = t.auditAction as Record<string, string>;
  const bereiche = t.auditDomain as Record<string, string>;
  const zeit = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "de-DE", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  const liste: ProtokollZeile[] = zeilen.map((z) => {
    const rows = aenderungen(z.vorher, z.nachher);
    const kurz = kurzfassung(rows);
    return {
      id: z.id,
      zeit: zeit.format(new Date(z.created_at)),
      aktion: aktionsName(z.action, aktionen, bereiche),
      system: z.action,
      objekt: z.object_type,
      objektId: z.object_id,
      wer: z.actor_name,
      felder: kurz.felder,
      weitere: kurz.weitere,
      aenderungen: rows,
    };
  });

  const mitSeite = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "seite") p.set(k, v);
    if (n > 1) p.set("seite", String(n));
    return `/admin/verwaltung/protokoll${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader word={t.admin.words.auditLog} title={t.auditLog.title} description={t.auditLog.lead} />

      <ProtokollFilter
        werte={{ von, aktion: q.aktion ?? "", objekt: q.objekt ?? "", person: q.person ?? "", ab: q.ab ?? "", bis: q.bis ?? "" }}
        aktionen={f.actions
          .map((a) => ({ value: a, label: aktionsName(a, aktionen, bereiche) }))
          .sort((a, b) => a.label.localeCompare(b.label, locale))}
        objekte={f.object_types.map((o) => ({ value: o, label: o }))}
        personen={f.actors.map((a) => ({ value: a.id, label: a.name }))}
        t={t.auditLog}
      />

      {liste.length === 0 ? (
        <EmptyState title={t.auditLog.empty} description={t.auditLog.emptyBody} />
      ) : (
        <>
          <p className="ct-label mb-2 text-ink">{t.auditLog.count.replace("{n}", String(gesamt))}</p>
          <ProtokollListe zeilen={liste} t={t.auditLog} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ct-help">
              {t.auditLog.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}
            </span>
            {seite > 1 && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite - 1)}>{t.auditLog.prev}</ButtonLink>}
            {seite < seiten && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite + 1)}>{t.auditLog.next}</ButtonLink>}
          </div>
        </>
      )}
    </>
  );
}
