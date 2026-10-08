import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadVocabMap, vgroup, vlabel } from "@/lib/vocab";
import { requireAdminSection } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import {
  KONTO_FILTER,
  KONTO_TON,
  SORTIERUNG,
  kontoDerZeile,
  kuerzen,
  leseKonto,
  leseSortierung,
  listenAdresse,
  type PersonZeile,
} from "@/lib/personen/liste";
import { PersonenFilter } from "./PersonenFilter";

export const dynamic = "force-dynamic";

const SEITE = 50;
/** Mehr Rollen oder Editionen passen nicht in eine Zelle; der Rest steht in der Einzelansicht. */
const IN_ZELLE = 3;

/**
 * Die Personenliste (ADM-091, Konrad 08.10.2026: „lange Liste, keine Suche, keine
 * Filter, keine relevanten Daten“). Suche über Name, E-Mail-Adressen und
 * Arbeitgeber; Filter nach Rolle, Edition und Konto-Status; die Spalten zeigen,
 * was man beim Suchen braucht — Rollen, Editionen, ob die Person ein Konto hat.
 *
 * Gelesen wird über die **Sitzung** (`persons_admin_list`), nicht mit dem
 * Admin-Client: die Funktion prüft den Abschnitt `persons` selbst, und die Seite
 * hält keinen Schlüssel, der an jeder Prüfung vorbeiliest. Filter und Seite
 * stehen in der Adresszeile.
 */
export default async function PersonenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rolle?: string; edition?: string; konto?: string; sort?: string; seite?: string }>;
}) {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation nicht neu.
  await requireAdminSection("persons", "/admin/personen");
  const { locale, t } = await getI18n();
  const p = t.admin.persons as Record<string, string>;
  const roh = await searchParams;
  const q = (roh.q ?? "").trim().slice(0, 100);
  const rolle = (roh.rolle ?? "").trim();
  const edition = /^[0-9a-f-]{36}$/i.test(roh.edition ?? "") ? (roh.edition as string) : "";
  const konto = leseKonto(roh.konto);
  const sort = leseSortierung(roh.sort);
  const seite = Math.max(1, Number(roh.seite ?? "1") || 1);

  const supabase = await createSupabaseServerClient();
  const [liste, { data: editionen }, vocab] = await Promise.all([
    supabase.rpc("persons_admin_list", {
      p_query: q || null,
      p_role: rolle || null,
      p_edition: edition || null,
      p_account: konto || null,
      p_sort: sort,
      p_limit: SEITE,
      p_offset: (seite - 1) * SEITE,
    }),
    supabase.from("event").select("id, name").eq("is_edition", true).order("start_date", { ascending: false }),
    loadVocabMap(supabase, locale),
  ]);

  const zeilen = (liste.data ?? []) as PersonZeile[];
  const gesamt = zeilen[0]?.total ?? 0;
  const seiten = Math.max(1, Math.ceil(gesamt / SEITE));
  const rollenLabel = vgroup(vocab, "role");
  const dateFormat = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });
  const gefiltert = Boolean(q || rolle || edition || konto);
  const mitSeite = (n: number) => listenAdresse("/admin/personen", { q, rolle, edition, konto, sort, seite: n });

  return (
    <>
      <PageHeader
        word={t.admin.words.persons}
        title={t.admin.persons.title}
        description={liste.error ? undefined : p.count.replace("{n}", String(gesamt))}
      />

      <PersonenFilter
        werte={{ q, rolle, edition, konto, sort }}
        rollen={Object.entries(rollenLabel)
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label, locale))}
        editionen={((editionen ?? []) as { id: string; name: string }[]).map((e) => ({ value: e.id, label: e.name }))}
        konten={KONTO_FILTER.map((k) => ({ value: k, label: p[`filterAccount_${k}`] }))}
        sortierungen={SORTIERUNG.map((s) => ({ value: s, label: p[`sort_${s}`] }))}
        t={p}
      />

      {liste.error ? (
        <EmptyState title={p.loadFailed} description={p.loadFailedBody} />
      ) : zeilen.length === 0 ? (
        gefiltert ? (
          <EmptyState
            title={p.noResults}
            description={p.noResultsBody}
            action={<Link className="ct-link" href={listenAdresse("/admin/personen", { sort })}>{p.clearFilters}</Link>}
          />
        ) : (
          <EmptyState title={p.emptyTitle} description={p.emptyBody} />
        )
      ) : (
        <>
          <Table stapeln>
            <Thead>
              <Th>{p.colName}</Th>
              <Th>{p.colEmail}</Th>
              <Th>{p.colRoles}</Th>
              <Th>{p.colEditions}</Th>
              <Th>{p.colAccount}</Th>
              <Th>{p.colStatus}</Th>
              <Th>{p.colCreated}</Th>
            </Thead>
            <Tbody>
              {zeilen.map((z) => {
                const name = [z.first_name, z.last_name].filter(Boolean).join(" ") || p.noName;
                const k = kontoDerZeile(z);
                const rollen = kuerzen(z.roles, IN_ZELLE);
                const editionenZelle = kuerzen(z.editions, IN_ZELLE);
                return (
                  <Tr key={z.person_id}>
                    <Td>
                      <Link href={`/admin/personen/${z.person_id}`} className="ct-link">
                        {name}
                      </Link>
                    </Td>
                    <Td label={p.colEmail} className="text-muted">{z.email ?? t.common.none}</Td>
                    <Td label={p.colRoles}>
                      {z.roles.length === 0 ? (
                        <span className="text-muted">{t.common.none}</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {rollen.sichtbar.map((r) => (
                            <Badge key={r}>{rollenLabel[r] ?? r}</Badge>
                          ))}
                          {rollen.weitere > 0 && <span className="ct-help">{p.more.replace("{n}", String(rollen.weitere))}</span>}
                        </span>
                      )}
                    </Td>
                    <Td label={p.colEditions} className="text-muted">
                      {z.editions.length === 0
                        ? t.common.none
                        : editionenZelle.sichtbar.join(", ") +
                          (editionenZelle.weitere > 0 ? ` ${p.more.replace("{n}", String(editionenZelle.weitere))}` : "")}
                    </Td>
                    <Td label={p.colAccount}>
                      <Badge tone={KONTO_TON[k]}>{p[`account_${k}`]}</Badge>
                    </Td>
                    <Td label={p.colStatus}>{vlabel(vocab, "occupation_status", z.occupation_status)}</Td>
                    <Td label={p.colCreated} className="text-muted">
                      {dateFormat.format(new Date(z.created_at))}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="ct-help">
              {p.page.replace("{seite}", String(seite)).replace("{seiten}", String(seiten))}
            </span>
            {seite > 1 && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite - 1)}>{p.prev}</ButtonLink>}
            {seite < seiten && <ButtonLink prefetch={false} variant="secondary" size="sm" href={mitSeite(seite + 1)}>{p.next}</ButtonLink>}
          </div>
        </>
      )}
    </>
  );
}
