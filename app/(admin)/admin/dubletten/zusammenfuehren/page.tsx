import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toRpcFailure } from "@/lib/rpc-error";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { ZusammenfuehrenKnopf } from "../DublettenFormulare";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Person = {
  name: string | null; email: string | null; emails: number;
  has_account: boolean; blocked: boolean; created_at: string;
};
type Zeile = { table: string; column?: string; rows: number };
type Vorschau = {
  survivor: Person; merged: Person;
  moved: Zeile[]; deduplicated: Zeile[]; conflicts: Zeile[];
  filled: string[]; emails: number; account_moved: boolean; blocking: string[];
};

/**
 * Vorschau einer Zusammenführung (ADM-036). `person_merge_preview` fährt den
 * echten Ablauf und nimmt ihn zurück — was hier steht, passiert beim Klick
 * genau so. „Tauschen" dreht um, wer bleibt.
 */
export default async function ZusammenfuehrenPage({
  searchParams,
}: {
  searchParams: Promise<{ bleibt?: string; geht?: string }>;
}) {
  await requireAdminSection("duplicates", "/admin/dubletten");
  const { bleibt, geht } = await searchParams;
  if (!bleibt || !geht || !UUID.test(bleibt) || !UUID.test(geht)) notFound();
  const { t } = await getI18n();
  const d = t.duplicatesAdmin as Record<string, string>;
  const tabellen = t.duplicateTables as Record<string, string>;
  const felder = t.duplicateFields as Record<string, string>;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("person_merge_preview", { p_survivor: bleibt, p_merged: geht });
  const zurueck = (
    <ButtonLink href="/admin/dubletten" variant="ghost" size="sm">
      {d.back}
    </ButtonLink>
  );
  if (error || !data) {
    const f = toRpcFailure(error);
    if (f.key === "unknown") console.error("[dubletten] person_merge_preview:", f.raw);
    return (
      <>
        <PageHeader word={t.admin.words.duplicates} title={d.previewTitle} />
        <EmptyState title={d.previewError} description={(t.rpc as Record<string, string>)[f.key] ?? t.rpc.unknown} action={zurueck} />
      </>
    );
  }
  const v = data as Vorschau;
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });
  const tabelle = (z: Zeile) => tabellen[z.column && z.table === "person" ? `person.${z.column}` : z.table] ?? z.table;
  const gesperrt = v.blocking.length > 0;

  const karte = (titel: string, p: Person, id: string) => (
    <Card>
      <p className="ct-eyebrow text-muted">{titel}</p>
      <Link href={`/admin/personen/${id}`} className="ct-h3 ct-link mt-1 block">
        {p.name ?? d.noName}
      </Link>
      <p className="ct-small text-muted">{p.email ?? "—"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {p.has_account && <Badge tone="accent">{d.account}</Badge>}
        {p.blocked && <Badge tone="warning">{d.blocked}</Badge>}
        {p.emails > 1 && <Badge>{d.emailsCount.replace("{n}", String(p.emails))}</Badge>}
        <span className="ct-help text-muted">{d.since.replace("{datum}", datum.format(new Date(p.created_at)))}</span>
      </div>
    </Card>
  );

  const liste = (zeilen: Zeile[]) => (
    <ul className="ct-small flex flex-col gap-1">
      {zeilen.map((z) => (
        <li key={`${z.table}.${z.column ?? ""}`} className="flex justify-between gap-4">
          <span>{tabelle(z)}</span>
          <span className="tabular-nums text-muted">{z.rows}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <PageHeader
        word={t.admin.words.duplicates}
        title={d.previewTitle}
        description={d.previewLead}
        actions={
          <>
            <ButtonLink href={`/admin/dubletten/zusammenfuehren?bleibt=${geht}&geht=${bleibt}`} variant="secondary" size="sm">
              {d.swap}
            </ButtonLink>
            {zurueck}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {karte(d.survivorLabel, v.survivor, bleibt)}
        {karte(d.mergedLabel, v.merged, geht)}
      </div>

      {gesperrt && (
        <Card className="mt-6 border-error-soft">
          <CardHeader ebene="h2" title={d.blockedTitle} description={d.blockedLead} />
          <ul className="ct-small flex list-disc flex-col gap-1 pl-5">
            {v.blocking.filter((b) => b !== "conflicts").map((b) => (
              <li key={b}>{d[`blocking_${b}`] ?? b}</li>
            ))}
            {v.conflicts.map((z) => (
              <li key={`${z.table}.${z.column}`}>
                {d.conflictRow.replace("{tabelle}", tabelle(z)).replace("{n}", String(z.rows))}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader ebene="h2" title={d.whatTitle} description={d.whatLead.replace("{name}", v.merged.name ?? d.noName)} />
        <div className="grid gap-6 md:grid-cols-2">
          <section>
            <h3 className="ct-label">{d.movedTitle}</h3>
            {v.moved.length === 0 ? <p className="ct-small text-muted">{d.nothing}</p> : liste(v.moved)}
            {v.emails > 0 && <p className="ct-small mt-2">{d.emailsMoved.replace("{n}", String(v.emails))}</p>}
          </section>
          <section className="flex flex-col gap-4">
            <div>
              <h3 className="ct-label">{d.dedupTitle}</h3>
              <p className="ct-help text-muted">{d.dedupLead}</p>
              {v.deduplicated.length === 0 ? <p className="ct-small text-muted">{d.nothing}</p> : liste(v.deduplicated)}
            </div>
            <div>
              <h3 className="ct-label">{d.filledTitle}</h3>
              <p className="ct-help text-muted">{d.filledLead}</p>
              {v.filled.length === 0 ? (
                <p className="ct-small text-muted">{d.nothing}</p>
              ) : (
                <p className="ct-small">{v.filled.map((f) => felder[f] ?? f).join(", ")}</p>
              )}
            </div>
            {v.account_moved && <p className="ct-small">{d.accountMoves}</p>}
          </section>
        </div>
      </Card>

      <div className="mt-6 flex flex-col items-start gap-2">
        <p className="ct-help text-muted">{d.undoHint}</p>
        <ZusammenfuehrenKnopf
          bleibt={bleibt}
          geht={geht}
          name={v.merged.name ?? d.noName}
          ziel={v.survivor.name ?? d.noName}
          gesperrt={gesperrt}
          t={d}
          common={{ cancel: t.common.cancel }}
          rpcMessages={t.rpc as Record<string, string>}
        />
      </div>
    </>
  );
}
