import Link from "next/link";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EinwilligungsTabelle, type Einwilligung } from "./EinwilligungsTabelle";

export const dynamic = "force-dynamic";

const SEITE = 50;
const PFAD = "/admin/verwaltung/einwilligungen";

/**
 * Einwilligungen (ADM-033): wer wann welcher Fassung zugestimmt, sie abgelehnt
 * oder widerrufen hat. Vorher stand das nur in der Datenbank — der Nachweis,
 * den die DSGVO verlangt, war im Portal nicht zu führen.
 *
 * Filter und Seite in der Adresszeile, wie im Protokoll: ein Fund lässt sich
 * weiterschicken. **Kein Export** — die Liste trägt Namen und Adressen; wer
 * etwas belegen muss, zeigt die Zeile oder die Personenseite.
 */
export default async function EinwilligungenPage({
  searchParams,
}: {
  searchParams: Promise<{ typ?: string; zustand?: string; q?: string; seite?: string }>;
}) {
  await requireAdminSection("consents", PFAD);
  const { locale, t } = await getI18n("de");
  const c = t.consentsAdmin as Record<string, string>;
  const q = await searchParams;
  const seite = Math.max(1, Number(q.seite ?? "1") || 1);
  const supabase = await createSupabaseServerClient();

  const [{ data, error }, vocab] = await Promise.all([
    supabase.rpc("consent_records_admin", {
      p_person_id: null,
      p_type: q.typ || null,
      p_state: q.zustand || null,
      p_query: q.q || null,
      p_limit: SEITE,
      p_offset: (seite - 1) * SEITE,
    }),
    loadVocabMap(supabase, locale),
  ]);
  const zeilen = (data ?? []) as Einwilligung[];
  const typen = vgroup(vocab, "consent_type");
  const gesamt = zeilen[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / SEITE));
  const mitSeite = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v && k !== "seite") p.set(k, v);
    if (n > 1) p.set("seite", String(n));
    return `${PFAD}${p.size ? `?${p}` : ""}`;
  };

  return (
    <>
      <PageHeader word={t.admin.words.consents} title={c.title} description={c.lead} />

      <form className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" action={PFAD}>
        <Field label={c.filterType} htmlFor="ew-typ">
          <Select id="ew-typ" name="typ" defaultValue={q.typ ?? ""} placeholder={c.filterAll}
            options={Object.entries(typen).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label={c.filterState} htmlFor="ew-zustand">
          <Select id="ew-zustand" name="zustand" defaultValue={q.zustand ?? ""} placeholder={c.filterAll}
            options={["granted", "declined", "revoked"].map((z) => ({ value: z, label: c[`state_${z}`] }))} />
        </Field>
        <Field label={c.filterSearch} htmlFor="ew-q">
          <Input id="ew-q" name="q" defaultValue={q.q ?? ""} placeholder={c.searchPlaceholder} />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm">{c.apply}</Button>
          <Link className="ct-link ct-small" href={PFAD}>{c.reset}</Link>
        </div>
      </form>

      {error ? (
        <EmptyState title={c.errorTitle} description={c.errorBody} />
      ) : zeilen.length === 0 ? (
        <EmptyState title={c.empty} description={c.emptyBody} />
      ) : (
        <>
          <p className="ct-label mb-2 text-ink">{c.count.replace("{n}", String(gesamt))}</p>
          <EinwilligungsTabelle zeilen={zeilen} typen={typen} mitPerson dateLocale={t.meta.dateLocale} t={c} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ct-help">{c.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}</span>
            {seite > 1 && <Link className="ct-link ct-small" href={mitSeite(seite - 1)}>{c.prev}</Link>}
            {seite < seiten && <Link className="ct-link ct-small" href={mitSeite(seite + 1)}>{c.next}</Link>}
          </div>
        </>
      )}
    </>
  );
}
