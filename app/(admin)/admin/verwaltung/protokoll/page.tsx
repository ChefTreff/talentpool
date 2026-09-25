import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
const ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
});

/**
 * Das Protokoll der Admin-Aktionen (PORT4a).
 *
 * „Audit-Log für Admin-Aktionen" steht unter „nicht verhandelbar". Geschrieben
 * wurde es seit Welle 1; **angesehen** hat es bisher niemand, ausser über die
 * Datenbank — eine Zusage, die nur auf dem Papier stand.
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
  searchParams: Promise<{ aktion?: string; objekt?: string; person?: string; ab?: string; bis?: string; seite?: string }>;
}) {
  await requireAdminSection("auditLog", "/admin/verwaltung/protokoll");
  const { t } = await getI18n("de");
  const q = await searchParams;
  const seite = Math.max(1, Number(q.seite ?? "1") || 1);
  const supabase = await createSupabaseServerClient();

  const [eintraege, filter] = await Promise.all([
    supabase.rpc("audit_log_admin", {
      p_action: q.aktion || null,
      p_object_type: q.objekt || null,
      p_actor: q.person || null,
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

  const mitSeite = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "seite") p.set(k, v);
    if (n > 1) p.set("seite", String(n));
    return `/admin/verwaltung/protokoll${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader word={t.admin.words.auditLog} title={t.auditLog.title} description={t.auditLog.lead} />

      <form className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" action="/admin/verwaltung/protokoll">
        <Field label={t.auditLog.filterAction} htmlFor="al-action">
          <Select
            id="al-action" name="aktion" defaultValue={q.aktion ?? ""} placeholder={t.auditLog.filterAll}
            options={f.actions.map((a) => ({ value: a, label: a }))}
          />
        </Field>
        <Field label={t.auditLog.filterObject} htmlFor="al-object">
          <Select
            id="al-object" name="objekt" defaultValue={q.objekt ?? ""} placeholder={t.auditLog.filterAll}
            options={f.object_types.map((o) => ({ value: o, label: o }))}
          />
        </Field>
        <Field label={t.auditLog.filterActor} htmlFor="al-actor">
          <Select
            id="al-actor" name="person" defaultValue={q.person ?? ""} placeholder={t.auditLog.filterAll}
            options={f.actors.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
        <Field label={t.auditLog.filterFrom} htmlFor="al-from">
          <Input id="al-from" name="ab" type="date" defaultValue={q.ab ?? ""} />
        </Field>
        <Field label={t.auditLog.filterTo} htmlFor="al-to">
          <Input id="al-to" name="bis" type="date" defaultValue={q.bis ?? ""} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">{t.auditLog.apply}</Button>
          <Link className="ct-link ct-small" href="/admin/verwaltung/protokoll">{t.auditLog.reset}</Link>
        </div>
      </form>

      {zeilen.length === 0 ? (
        <EmptyState title={t.auditLog.empty} description={t.auditLog.emptyBody} />
      ) : (
        <>
          <p className="ct-label mb-2 text-ink">{t.auditLog.count.replace("{n}", String(gesamt))}</p>
          <Card>
            <ul className="flex flex-col divide-y">
              {zeilen.map((z) => (
                <li key={z.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="ct-help tabular-nums">{ZEIT.format(new Date(z.created_at))}</span>
                    <span className="ct-label text-ink">{z.action}</span>
                    {z.object_type && (
                      <span className="ct-help">
                        {z.object_type}
                        {z.object_id && ` · ${z.object_id}`}
                      </span>
                    )}
                    {/* Ohne Person heisst: der Server hat es getan. Das ist eine
                        Information, keine Lücke — deshalb ein Wort statt eines
                        Strichs. */}
                    <Badge tone={z.actor_name ? "neutral" : "success"}>
                      {z.actor_name ?? t.auditLog.system}
                    </Badge>
                  </div>
                  {(z.vorher != null || z.nachher != null) && (
                    <details className="group mt-2 rounded-ct-md border bg-canvas open:border-accent">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2 ct-small text-muted [&::-webkit-details-marker]:hidden">
                        {t.auditLog.detail}
                      </summary>
                      <div className="grid gap-3 px-3 pb-3 sm:grid-cols-2">
                        <div>
                          <div className="ct-label text-ink">{t.auditLog.before}</div>
                          <pre className="ct-help overflow-x-auto whitespace-pre-wrap break-all">
                            {z.vorher == null ? t.auditLog.nothing : JSON.stringify(z.vorher, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div className="ct-label text-ink">{t.auditLog.after}</div>
                          <pre className="ct-help overflow-x-auto whitespace-pre-wrap break-all">
                            {z.nachher == null ? t.auditLog.nothing : JSON.stringify(z.nachher, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ct-help">
              {t.auditLog.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}
            </span>
            {seite > 1 && <Link className="ct-link ct-small" href={mitSeite(seite - 1)}>{t.auditLog.prev}</Link>}
            {seite < seiten && <Link className="ct-link ct-small" href={mitSeite(seite + 1)}>{t.auditLog.next}</Link>}
          </div>
        </>
      )}
    </>
  );
}
