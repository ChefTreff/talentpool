import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireArea } from "@/lib/auth";
import { getI18n } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/PageHeader";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { VocabToggle } from "./VocabToggle";

export const dynamic = "force-dynamic";

type Term = {
  vocabulary: string;
  key: string;
  label_de: string;
  label_en: string | null;
  active: boolean;
  parent_key: string | null;
};

export default async function VokabularPage() {
  // Gate je Seite, nicht nur im Layout: Layouts rendern bei Client-Navigation
  // nicht neu. Muss vor createSupabaseAdminClient() stehen.
  await requireArea("admin", "/admin/vokabular");
  const admin = createSupabaseAdminClient();
  const { t } = await getI18n();

  const { data } = await admin
    .from("vocab_term")
    .select("vocabulary,key,label_de,label_en,active,parent_key")
    .order("vocabulary")
    .order("sort_order");

  const terms = (data ?? []) as Term[];
  const groups: Record<string, Term[]> = {};
  for (const term of terms) (groups[term.vocabulary] ??= []).push(term);
  const names = Object.keys(groups).sort();

  return (
    <>
      <PageHeader
        title={t.admin.vocab.title}
        description={`${terms.length} ${t.admin.vocab.count} ${names.length} ${t.admin.vocab.vocabularies}. ${t.admin.vocab.lead}`}
      />

      <div className="flex flex-col gap-8">
        {names.map((v) => (
          <section key={v}>
            <h2 className="ct-h2 mb-2 text-ink">
              {v}{" "}
              <span className="font-semibold normal-case tracking-normal text-muted">
                ({groups[v].length})
              </span>
            </h2>
            <Table>
              <Thead>
                <Th>{t.admin.vocab.colKey}</Th>
                <Th>{t.admin.vocab.colDe}</Th>
                <Th>{t.admin.vocab.colEn}</Th>
                <Th>{t.admin.vocab.colParent}</Th>
                <Th>{t.admin.vocab.colStatus}</Th>
              </Thead>
              <Tbody>
                {groups[v].map((term) => (
                  <Tr key={term.key}>
                    <Td className="font-mono text-[13px] text-muted">{term.key}</Td>
                    <Td>{term.label_de}</Td>
                    <Td className="text-muted">{term.label_en ?? t.common.none}</Td>
                    <Td className="font-mono text-[13px] text-muted">
                      {term.parent_key ?? ""}
                    </Td>
                    <Td>
                      <VocabToggle
                        vocabulary={v}
                        termKey={term.key}
                        active={term.active}
                        labels={{ on: t.common.active, off: t.common.inactive }}
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </section>
        ))}
      </div>
    </>
  );
}
