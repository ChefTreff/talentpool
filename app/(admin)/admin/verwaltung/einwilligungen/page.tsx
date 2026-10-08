import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup } from "@/lib/vocab";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { EinwilligungsTabelle, type Einwilligung } from "./EinwilligungsTabelle";
import { EinwilligungenFilter } from "./EinwilligungenFilter";
import { PersonenStandTabelle } from "./PersonenStandTabelle";
import {
  ZUSTAENDE,
  einwilligungenAdresse,
  leseAnsicht,
  leseZustand,
  type PersonenStand,
} from "@/lib/einwilligungen/stand";

export const dynamic = "force-dynamic";

const SEITE = 50;
const PFAD = "/admin/verwaltung/einwilligungen";

/**
 * Einwilligungen (ADM-033, ADM-096): wer wann welcher Fassung zugestimmt, sie
 * abgelehnt oder widerrufen hat.
 *
 * **Je Person** (Standard, ADM-096 — Konrad 08.10.): eine Zeile je Person mit dem
 * aktuellen Stand je Art (erteilt, abgelehnt, widerrufen). **Je Eintrag**: der
 * Nachweis Zeile für Zeile, wie bisher — die DSGVO verlangt, dass nichts
 * überschrieben wird, und diese Sicht bleibt eine Umschaltung entfernt. Auf der
 * Personenseite steht beides: der Stand und der Verlauf.
 *
 * Filter, Ansicht und Seite stehen in der Adresszeile. **Kein Export** — die
 * Liste trägt Namen und Adressen; wer etwas belegen muss, zeigt die Zeile oder
 * die Personenseite.
 */
export default async function EinwilligungenPage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; typ?: string; zustand?: string; q?: string; seite?: string }>;
}) {
  await requireAdminSection("consents", PFAD);
  const { locale, t } = await getI18n("de");
  const c = t.consentsAdmin as Record<string, string>;
  const roh = await searchParams;
  const ansicht = leseAnsicht(roh.ansicht);
  const zustand = leseZustand(roh.zustand);
  const q = (roh.q ?? "").trim().slice(0, 100);
  const typ = (roh.typ ?? "").trim();
  const seite = Math.max(1, Number(roh.seite ?? "1") || 1);
  const supabase = await createSupabaseServerClient();

  const [liste, vocab] = await Promise.all([
    ansicht === "person"
      ? supabase.rpc("consent_overview_admin", {
          p_type: typ || null,
          p_state: zustand || null,
          p_query: q || null,
          p_limit: SEITE,
          p_offset: (seite - 1) * SEITE,
        })
      : supabase.rpc("consent_records_admin", {
          p_person_id: null,
          p_type: typ || null,
          p_state: zustand || null,
          p_query: q || null,
          p_limit: SEITE,
          p_offset: (seite - 1) * SEITE,
        }),
    loadVocabMap(supabase, locale),
  ]);
  const typen = vgroup(vocab, "consent_type");
  const zeilen = (liste.data ?? []) as { total: number }[];
  const gesamt = zeilen[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / SEITE));
  const mitSeite = (n: number) => einwilligungenAdresse(PFAD, { ansicht, typ, zustand, q, seite: n });

  return (
    <>
      <PageHeader word={t.admin.words.consents} title={c.title} description={ansicht === "person" ? c.leadPerson : c.lead} />

      <EinwilligungenFilter
        werte={{ ansicht, typ, zustand, q }}
        typen={Object.entries(typen).map(([value, label]) => ({ value, label }))}
        zustaende={ZUSTAENDE.map((z) => ({ value: z, label: c[`state_${z}`] }))}
        t={c}
      />

      {liste.error ? (
        <EmptyState title={c.errorTitle} description={c.errorBody} />
      ) : zeilen.length === 0 ? (
        <EmptyState title={c.empty} description={c.emptyBody} />
      ) : (
        <>
          <p className="ct-label mb-2 text-ink">
            {(ansicht === "person" ? c.countPersons : c.count).replace("{n}", String(gesamt))}
          </p>
          {ansicht === "person" ? (
            <PersonenStandTabelle zeilen={zeilen as PersonenStand[]} typen={typen} dateLocale={t.meta.dateLocale} t={c} />
          ) : (
            <EinwilligungsTabelle zeilen={zeilen as Einwilligung[]} typen={typen} mitPerson dateLocale={t.meta.dateLocale} t={c} />
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ct-help">{c.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}</span>
            {seite > 1 && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite - 1)}>{c.prev}</ButtonLink>}
            {seite < seiten && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite + 1)}>{c.next}</ButtonLink>}
          </div>
        </>
      )}
    </>
  );
}
