import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadVocabMap, vlabel } from "@/lib/vocab";
import { getSessionContext } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  occupation_status: string | null;
  created_at: string;
  person_email: { email: string; is_primary: boolean }[] | null;
};

export default async function PersonenPage() {
  const admin = createSupabaseAdminClient();
  const { preferredLanguage } = await getSessionContext();
  const { locale, t } = await getI18n(preferredLanguage);

  const [{ data: persons }, vocab] = await Promise.all([
    admin
      .from("person")
      .select(
        "id, first_name, last_name, occupation_status, created_at, person_email(email, is_primary)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    loadVocabMap(admin, locale),
  ]);

  const rows = (persons ?? []) as Row[];
  const dateFormat = new Intl.DateTimeFormat(t.meta.dateLocale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        title={t.admin.persons.title}
        description={`${rows.length} ${t.common.shown}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={t.admin.persons.emptyTitle}
          description={t.admin.persons.emptyBody}
        />
      ) : (
        <Table>
          <Thead>
            <Th>{t.admin.persons.colName}</Th>
            <Th>{t.admin.persons.colEmail}</Th>
            <Th>{t.admin.persons.colStatus}</Th>
            <Th>{t.admin.persons.colCreated}</Th>
          </Thead>
          <Tbody>
            {rows.map((p) => {
              const primary =
                p.person_email?.find((e) => e.is_primary)?.email ??
                p.person_email?.[0]?.email ??
                t.common.none;
              const name =
                [p.first_name, p.last_name].filter(Boolean).join(" ") ||
                t.admin.persons.noName;
              return (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/admin/personen/${p.id}`} className="ct-link">
                      {name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{primary}</Td>
                  <Td>{vlabel(vocab, "occupation_status", p.occupation_status)}</Td>
                  <Td className="text-muted">
                    {dateFormat.format(new Date(p.created_at))}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </>
  );
}
