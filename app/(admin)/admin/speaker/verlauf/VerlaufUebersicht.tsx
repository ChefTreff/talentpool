"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { VERLAUF_ARTEN, fristStand, heute } from "@/lib/speaker/verlauf";

type Strings = Record<string, string>;

/** Zeile aus `speaker_activity_overview(edition)`. */
export type UebersichtZeile = {
  id: string;
  profile_id: string;
  speaker_name: string | null;
  pipeline_status: string;
  kind: string;
  body: string;
  occurred_at: string;
  due_on: string | null;
  done_at: string | null;
  assignee_name: string | null;
  author_name: string | null;
};

/**
 * Alle Einträge der Edition in einer Tabelle (LEAD-025), filterbar nach Art und
 * Text. Der Speaker führt ins Detail, wo der Eintrag bearbeitet wird.
 */
export function VerlaufUebersicht({
  zeilen,
  arten,
  dateLocale,
  t,
}: {
  zeilen: UebersichtZeile[];
  arten: Record<string, string>;
  dateLocale: string;
  t: Strings;
}) {
  const [art, setArt] = useState("");
  const [suche, setSuche] = useState("");
  const [heuteIso] = useState(() => heute());
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const tag = (iso: string) => datum.format(new Date(`${iso}T12:00:00`));

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return zeilen
      .filter((z) => !art || z.kind === art)
      .filter(
        (z) =>
          !q ||
          [z.speaker_name, z.body, z.author_name, z.assignee_name].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
      );
  }, [zeilen, art, suche]);

  const stand = (z: UebersichtZeile): { ton: BadgeTone; text: string } | null => {
    if (z.kind !== "task") return null;
    if (z.done_at) return { ton: "success", text: t.done };
    const f = fristStand(z.due_on ?? heuteIso, heuteIso);
    if (f === "ueberfaellig") return { ton: "error", text: `${t.overdue} · ${tag(z.due_on!)}` };
    if (f === "heute") return { ton: "warning", text: t.dueToday };
    return { ton: "accent", text: t.dueOn.replace("{date}", tag(z.due_on!)) };
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.search} htmlFor="verlauf-suche" className="min-w-65">
            <Input id="verlauf-suche" value={suche} onChange={(e) => setSuche(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t.colKind} htmlFor="verlauf-art" className="min-w-44">
            <Select
              id="verlauf-art"
              value={art}
              placeholder={t.allKinds}
              options={VERLAUF_ARTEN.map((a) => ({ value: a, label: arten[a] ?? a }))}
              onChange={(e) => setArt(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      {sichtbar.length === 0 ? (
        <EmptyState title={t.overviewEmptyTitle} description={t.overviewEmptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colDate}</Th>
            <Th>{t.colSpeaker}</Th>
            <Th>{t.colKind}</Th>
            <Th>{t.colBody}</Th>
            <Th>{t.colState}</Th>
            <Th>{t.colAuthor}</Th>
          </Thead>
          <Tbody>
            {sichtbar.map((z) => {
              const s = stand(z);
              return (
                <Tr key={z.id}>
                  <Td className="whitespace-nowrap tabular-nums text-muted">{datum.format(new Date(z.occurred_at))}</Td>
                  <Td>
                    <Link href={`/admin/speaker/${z.profile_id}#verlauf`} className="ct-link">
                      {z.speaker_name ?? "—"}
                    </Link>
                  </Td>
                  <Td>
                    <Badge>{arten[z.kind] ?? z.kind}</Badge>
                  </Td>
                  <Td className="max-w-md">
                    <span className="line-clamp-3 ct-small text-ink">{z.body}</span>
                    {z.assignee_name && z.kind === "task" && (
                      <span className="ct-help block">
                        {t.assignee}: {z.assignee_name}
                      </span>
                    )}
                  </Td>
                  <Td>{s ? <Badge tone={s.ton}>{s.text}</Badge> : <span className="ct-help">—</span>}</Td>
                  <Td className="text-muted">{z.author_name ?? "—"}</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
