"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { SuchFeld } from "@/components/ui/SuchFeld";
import type { Betreuter, BuehnenZeile } from "@/lib/speaker/leads-uebersicht";
import {
  assignSpeaker,
  findPeople,
  makeLead,
  revokeLead,
  type FoundPerson,
  type LeadsResult,
} from "./actions";

type Strings = Record<string, string>;

export type LeadRow = {
  person_id: string;
  display_name: string | null;
  email: string | null;
  assignments: {
    id: string;
    role: string;
    scope_type: string;
    scope_id: string | null;
    edition_id: string | null;
    valid_to: string | null;
  }[];
  speakers: number;
  confirmed: number;
  declined: number;
  open_steps: number;
};

export type UnassignedRow = {
  profile_id: string;
  display_name: string | null;
  job_title: string | null;
  organization_name: string | null;
  speaker_type: string;
  pipeline_status: string;
  created_at: string;
};

/**
 * Wer betreut die Speaker — und wer betreut noch niemanden.
 *
 * Die unbetreuten Speaker stehen **oben**, nicht unten: das ist die Arbeit, die
 * hier liegt. Dann (ADM-068) **wer welche Bühne leitet** — eine Zeile je Bühne,
 * auch die ohne Stage Lead — und die Lead-Tabelle (wer trägt wie viel, mit den
 * Speakern zum Aufklappen); das Aufnehmen einer neuen Lead-Person ist der
 * seltenste Vorgang und steht deshalb zuletzt, erreichbar auch von der Bühne aus.
 *
 * Die Rolle wird je Bühne vergeben (PORT3): externe Stage Leads sehen nur die
 * Speaker und Slots ihrer Bühnen. Für mehrere Bühnen nimmt man die Person
 * mehrmals auf.
 */
export function LeadsView({
  leads,
  unassigned,
  stages,
  buehnen,
  betreute,
  labels,
  t,
  common,
  rpcMessages,
}: {
  leads: LeadRow[];
  unassigned: UnassignedRow[];
  /** Die Bühnen des Summits, für die jemand Stage Lead werden kann. */
  stages: { id: string; name: string }[];
  /** ADM-068: je Bühne die Stage Leads, Sessions und Speaker (`buehnenUebersicht`). */
  buehnen: BuehnenZeile[];
  /** ADM-068: je Lead-Person die Speaker, die ihr zugeordnet sind (`betreuteJeLead`), nach der Kennung der Person. */
  betreute: Record<string, Betreuter[]>;
  labels: Record<string, Record<string, string>>;
  t: Strings;
  common: { cancel: string; choose: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  /** Je unbetreutem Speaker die gewählte Lead-Person. */
  const [ziel, setZiel] = useState<Record<string, string>>({});
  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<FoundPerson[]>([]);
  const [gesucht, setGesucht] = useState(false);
  const [buehne, setBuehne] = useState(stages[0]?.id ?? "");
  const buehnenName = new Map(stages.map((s) => [s.id, s.name]));
  /** Offene Rückfrage beim Entziehen: die betroffene Zuweisung. */
  const [entziehen, setEntziehen] = useState<{ id: string; name: string; speakers: number } | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function report(res: LeadsResult, okText: string) {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
  }

  const leadOptions = leads.map((l) => ({
    value: l.person_id,
    label: `${l.display_name ?? l.email ?? l.person_id} (${l.speakers})`,
  }));

  /** Von einer Bühne aus eine Stage Lead aufnehmen: die Bühne ist gewählt, die Suche steht bereit (ADM-068). */
  function buehneWaehlen(id: string) {
    setBuehne(id);
    document.getElementById("lead-aufnehmen")?.scrollIntoView();
    document.getElementById("q")?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          ebene="h2"
          title={`${t.unassignedTitle} (${unassigned.length})`}
          description={t.unassignedHint}
        />
        {unassigned.length === 0 ? (
          <p className="ct-small text-muted">{t.allAssigned}</p>
        ) : leads.length === 0 ? (
          <EmptyState title={t.noLeadsTitle} description={t.noLeadsBody} />
        ) : (
          <ul className="flex flex-col gap-3">
            {unassigned.map((s) => (
              <li
                key={s.profile_id}
                className="flex flex-wrap items-end justify-between gap-3 border-b pb-3 last:border-0"
              >
                <div>
                  <Link href={`/admin/speaker/${s.profile_id}`} className="ct-link font-medium">
                    {s.display_name ?? common.none}
                  </Link>
                  <p className="ct-help text-muted">
                    {[s.job_title, s.organization_name].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Badge>{labels.speakerType[s.speaker_type] ?? s.speaker_type}</Badge>
                    <Badge>{labels.pipeline[s.pipeline_status] ?? s.pipeline_status}</Badge>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <Field label={t.assignTo} htmlFor={`z-${s.profile_id}`}>
                    <Select
                      id={`z-${s.profile_id}`}
                      value={ziel[s.profile_id] ?? ""}
                      placeholder={common.choose}
                      onChange={(e) => setZiel((z) => ({ ...z, [s.profile_id]: e.target.value }))}
                      options={leadOptions}
                    />
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={pending || !ziel[s.profile_id]}
                    onClick={() =>
                      startTransition(async () =>
                        report(await assignSpeaker(s.profile_id, ziel[s.profile_id]), t.assigned),
                      )
                    }
                  >
                    {t.assign}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ADM-068: wer welche Bühne leitet — eine Zeile je Bühne, auch die ohne Stage Lead (das ist die Zeile, auf die es ankommt). */}
      <div>
        <h2 className="ct-h2 text-ink">{t.stagesTitle}</h2>
        <p className="ct-help mb-3 mt-1 max-w-text">{t.stagesHint}</p>
        {buehnen.length === 0 ? (
          <EmptyState title={t.noStagesTitle} description={t.noStagesBody} />
        ) : (
          <Table stapeln>
            <Thead>
              <Th>{t.colStage}</Th>
              <Th>{t.colStageLeads}</Th>
              <Th numeric>{t.colSessions}</Th>
              <Th numeric>{t.colStageSpeakers}</Th>
              <Th aria-label={t.colAction} />
            </Thead>
            <Tbody>
              {buehnen.map((b) => (
                <Tr key={b.stage_id}>
                  <Td>
                    <span className="ct-label text-ink">{b.name}</span>
                  </Td>
                  <Td label={t.colStageLeads}>
                    {b.leads.length === 0 ? (
                      <Badge tone="warning">{t.noStageLead}</Badge>
                    ) : (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {b.leads.map((l) => (
                          <Link key={l.person_id} href={`/admin/personen/${l.person_id}`} className="ct-link">
                            {l.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td numeric label={t.colSessions}>
                    {b.sessions}
                  </Td>
                  <Td numeric label={t.colStageSpeakers}>
                    {b.speakers}
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={`${t.addStageLead}: ${b.name}`}
                      onClick={() => buehneWaehlen(b.stage_id)}
                    >
                      {t.addStageLead}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <div>
        <h2 className="ct-h2 mb-3 text-ink">{t.leadsTitle}</h2>
        {leads.length === 0 ? (
          <EmptyState title={t.noLeadsTitle} description={t.noLeadsBody} />
        ) : (
          <Table>
            <Thead>
              <Th>{t.colName}</Th>
              <Th>{t.colScope}</Th>
              <Th numeric>{t.colSpeakers}</Th>
              <Th numeric>{t.colConfirmed}</Th>
              <Th numeric>{t.colDeclined}</Th>
              <Th numeric>{t.colOpen}</Th>
              <Th />
            </Thead>
            <Tbody>
              {leads.map((l) => (
                <Tr key={l.person_id}>
                  <Td>
                    <Link href={`/admin/personen/${l.person_id}`} className="ct-link font-medium">
                      {l.display_name ?? common.none}
                    </Link>
                    {l.email && <span className="ct-help block text-muted">{l.email}</span>}
                    {/* ADM-068: wen diese Person betreut — die Zahl „Betreut“ zum Aufklappen. */}
                    {(betreute[l.person_id] ?? []).length > 0 && (
                      <details className="mt-1">
                        <summary className="ct-help cursor-pointer whitespace-nowrap font-semibold pointer-coarse:-my-3 pointer-coarse:py-3">
                          {t.showSpeakers.replace("{n}", String(betreute[l.person_id].length))}
                        </summary>
                        <ul className="mt-1 flex flex-col gap-1">
                          {betreute[l.person_id].map((s) => (
                            <li key={s.profile_id} className="flex flex-wrap items-center gap-x-2">
                              <Link href={`/admin/speaker/${s.profile_id}`} className="ct-link ct-small">
                                {s.name}
                              </Link>
                              <Badge tone={s.zugesagt ? "success" : "neutral"}>
                                {labels.pipeline[s.pipeline_status] ?? s.pipeline_status}
                              </Badge>
                              {s.offen > 0 && <span className="ct-help">{t.openStepsOne.replace("{n}", String(s.offen))}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {l.assignments.map((a) => (
                        <Badge key={a.id} tone={a.role === "area_lead_speaker" ? "accent" : "neutral"}>
                          {labels.role[a.role] ?? a.role} ·{" "}
                          {(a.scope_type === "stage" && a.scope_id && buehnenName.get(a.scope_id)) ||
                            (t[`scope_${a.scope_type}`] ?? a.scope_type)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td numeric>{l.speakers}</Td>
                  <Td numeric>{l.confirmed}</Td>
                  <Td numeric>{l.declined}</Td>
                  <Td numeric>
                    {l.open_steps === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Badge tone="warning">{l.open_steps}</Badge>
                    )}
                  </Td>
                  <Td>
                    {l.assignments
                      .filter((a) => a.role === "speaker_manager")
                      .map((a) => (
                        <Button
                          key={a.id}
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            setEntziehen({
                              id: a.id,
                              name: l.display_name ?? common.none,
                              speakers: l.speakers,
                            })
                          }
                        >
                          {t.revoke}
                        </Button>
                      ))}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <Card id="lead-aufnehmen">
        <CardHeader ebene="h2" title={t.addTitle} description={t.addHint} />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.stageLabel} htmlFor="lead-buehne" className="min-w-56">
            <Select
              id="lead-buehne"
              value={buehne}
              onChange={(e) => setBuehne(e.target.value)}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          </Field>
          <Field label={t.searchPerson} htmlFor="q" className="min-w-64 grow">
            <SuchFeld
              id="q"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={t.searchHint}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={pending || suche.trim().length < 2}
            onClick={() =>
              startTransition(async () => {
                setTreffer(await findPeople(suche.trim()));
                setGesucht(true);
              })
            }
          >
            {t.search}
          </Button>
        </div>
        {gesucht && treffer.length === 0 && (
          <p className="ct-help mt-3 text-muted">{t.noMatch}</p>
        )}
        {treffer.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {treffer.map((p) => {
              // Schon Stage Lead **dieser** Bühne — eine weitere Bühne geht.
              const schon = leads.some(
                (l) =>
                  l.person_id === p.id &&
                  l.assignments.some((a) => a.role === "speaker_manager" && a.scope_type === "stage" && a.scope_id === buehne),
              );
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <span className="ct-small">
                    {p.display_name ?? common.none}
                    {p.email && <span className="ct-help block text-muted">{p.email}</span>}
                  </span>
                  {schon ? (
                    <Badge tone="success">{t.alreadyLead}</Badge>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={pending || !buehne}
                      onClick={() =>
                        startTransition(async () => report(await makeLead(p.id, buehne), t.added))
                      }
                    >
                      {t.makeLead}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {entziehen && (
        <ConfirmDialog
          title={`${t.revokeTitle}: ${entziehen.name}`}
          body={t.revokeBody}
          // Die Zahl steht in der Rückfrage, weil sie die Entscheidung trägt:
          // eine Rolle zu entziehen, während zwölf Speaker an der Person
          // hängen, lässt zwölf Betreuungen zurück, die das Lead-Portal nicht
          // mehr öffnen können.
          detail={
            entziehen.speakers > 0 ? (
              <p className="ct-small text-error-ink">
                {entziehen.speakers} {t.revokeStillOwns}
              </p>
            ) : undefined
          }
          confirmLabel={t.revoke}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setEntziehen(null)}
          onConfirm={() => {
            const id = entziehen.id;
            setEntziehen(null);
            startTransition(async () => report(await revokeLead(id), t.revoked));
          }}
        />
      )}
    </div>
  );
}
