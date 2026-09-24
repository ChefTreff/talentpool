"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { SuchFeld } from "@/components/ui/SuchFeld";
import type { AdminSpeakerRow } from "./types";

type Strings = Record<string, string>;

/** Zusage grün, Absage rot, alles dazwischen neutral — Farbe stützt nur den Text. */
const TONE: Record<string, BadgeTone> = {
  lead: "neutral",
  contacted: "neutral",
  confirmed: "success",
  onboarded: "success",
  ready: "success",
  published: "accent",
  attended: "accent",
  declined: "error",
};

/**
 * Alle Speaker der Edition.
 *
 * Die Liste beantwortet vier Fragen, die im Alltag zusammen auftreten: Wer ist
 * zugesagt? Wer betreut ihn? Woran hakt es? Wann zuletzt angefasst? Deshalb
 * steht die Zahl der offenen Schritte als eigene Spalte und nicht erst im
 * Detail — sonst müsste man zwanzig Profile öffnen, um eines zu finden.
 *
 * Gefiltert wird im Browser: bei zweihundert Speakern ist das schneller als
 * jeder Seitenwechsel, und man springt beim Durchgehen ständig zwischen den
 * Filtern hin und her.
 */
export function SpeakerListe({
  rows,
  labels,
  dateLocale,
  t,
}: {
  rows: AdminSpeakerRow[];
  labels: Record<string, Record<string, string>>;
  dateLocale: string;
  t: Strings;
}) {
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState("");
  const [typ, setTyp] = useState("");
  const [betreuung, setBetreuung] = useState("");

  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  const name = (r: AdminSpeakerRow) =>
    [r.title, r.first_name, r.last_name].filter(Boolean).join(" ") || "—";

  /** Die Lead-Personen, die wirklich vorkommen — plus „ohne Betreuung". */
  const owner = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.owner_person_id && r.owner_name) map.set(r.owner_person_id, r.owner_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.pipeline_status !== status) return false;
      if (typ && r.speaker_type !== typ) return false;
      if (betreuung === "none" && r.owner_person_id) return false;
      if (betreuung && betreuung !== "none" && r.owner_person_id !== betreuung) return false;
      if (q) {
        const hay = [name(r), r.organization_name, r.job_title, r.email, r.owner_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, suche, status, typ, betreuung]);

  const ohneBetreuung = rows.filter((r) => !r.owner_person_id).length;
  const zugesagt = rows.filter((r) => r.confirmed_at !== null && r.declined_at === null).length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="ct-label text-ink">{t.search}</span>
            <SuchFeld
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t.searchHint}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ct-label text-ink">{t.filterStatus}</span>
            <Select
              value={status}
              placeholder={t.allStatus}
              onChange={(e) => setStatus(e.target.value)}
              options={Object.entries(labels.pipeline).map(([value, label]) => ({ value, label }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="ct-label text-ink">{t.filterType}</span>
            <Select
              value={typ}
              placeholder={t.allTypes}
              onChange={(e) => setTyp(e.target.value)}
              options={Object.entries(labels.speakerType).map(([value, label]) => ({ value, label }))}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="ct-label text-ink">{t.filterOwner}</span>
            <Select
              value={betreuung}
              placeholder={t.allOwners}
              onChange={(e) => setBetreuung(e.target.value)}
              options={[
                { value: "none", label: `${t.withoutOwner} (${ohneBetreuung})` },
                ...owner.map(([id, label]) => ({ value: id, label })),
              ]}
            />
          </label>
        </div>
        <p className="ct-help mt-3 text-muted">
          {gefiltert.length} {t.of} {rows.length} · {zugesagt} {t.confirmedCount} ·{" "}
          {ohneBetreuung} {t.withoutOwnerCount}
        </p>
      </Card>

      {gefiltert.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colName}</Th>
            <Th>{t.colRole}</Th>
            <Th>{t.colType}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{t.colOwner}</Th>
            <Th numeric>{t.colSessions}</Th>
            <Th numeric>{t.colOpen}</Th>
            <Th>{t.colUpdated}</Th>
          </Thead>
          <Tbody>
            {gefiltert.map((r) => {
              const offen = r.next_open?.length ?? 0;
              return (
                <Tr key={r.id}>
                  <Td>
                    <Link href={`/admin/speaker/${r.id}`} className="ct-link font-medium">
                      {name(r)}
                    </Link>
                    {r.email && <span className="ct-help block text-muted">{r.email}</span>}
                  </Td>
                  <Td>
                    <span className="block">{r.job_title ?? "—"}</span>
                    <span className="ct-help block text-muted">{r.organization_name ?? ""}</span>
                  </Td>
                  <Td>{labels.speakerType[r.speaker_type] ?? r.speaker_type}</Td>
                  <Td>
                    <Badge tone={TONE[r.pipeline_status] ?? "neutral"}>
                      {labels.pipeline[r.pipeline_status] ?? r.pipeline_status}
                    </Badge>
                    {r.decline_reason && (
                      <span className="ct-help block text-muted">
                        {labels.declineReason[r.decline_reason] ?? r.decline_reason}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {r.owner_name ?? <span className="text-muted">{t.withoutOwner}</span>}
                  </Td>
                  <Td numeric>{r.sessions?.length ?? 0}</Td>
                  <Td numeric>
                    {offen === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Badge tone="warning">{offen}</Badge>
                    )}
                  </Td>
                  <Td>{datum.format(new Date(r.updated_at))}</Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
