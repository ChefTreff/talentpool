"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { loadGuests, removeReception, saveReception } from "./actions";
import { RECEPTION_FIELDS, type ReceptionGuest, type ReceptionRow } from "./types";

type Strings = Record<string, string>;

/** Ein Zeitpunkt für `datetime-local`: Ortszeit ohne Zone, Minuten genau. */
function fuerEingabe(wert: string | null): string {
  if (!wert) return "";
  const d = new Date(wert);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const LEER: Record<string, string> = {
  id: "",
  title_de: "",
  title_en: "",
  description_de: "",
  description_en: "",
  location: "",
  address: "",
  starts_at: "",
  ends_at: "",
  capacity: "",
  rsvp_deadline: "",
};

/**
 * Die Reception anlegen, ändern, veröffentlichen — und sehen, wer kommt.
 *
 * Zwei Zahlen stehen bewusst nebeneinander: **Plätze** (Zusagen plus
 * Begleitungen, das ist die Obergrenze) und **Zusagen** (Menschen). Wer nur
 * eine davon sieht, plant falsch — entweder beim Catering oder bei der Tür.
 *
 * Die Gästeliste kommt **auf Klick**, nicht mit der Seite: Namen und Hinweise
 * sind Personendaten und sollen nicht mitgeladen werden, nur weil jemand die
 * Zahlen ansieht.
 */
export function ReceptionAdmin({
  rows,
  dateLocale,
  t,
  common,
  rpcMessages,
}: {
  rows: ReceptionRow[];
  dateLocale: string;
  t: Strings;
  common: { cancel: string; save: string; required: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState<Record<string, string> | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<ReceptionRow | null>(null);
  const [gaeste, setGaeste] = useState<{ id: string; rows: ReceptionGuest[] } | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  function bearbeiten(r: ReceptionRow) {
    setFehler(null);
    setOffen({
      id: r.id,
      title_de: r.title_de,
      title_en: r.title_en,
      description_de: r.description_de ?? "",
      description_en: r.description_en ?? "",
      location: r.location,
      address: r.address ?? "",
      starts_at: fuerEingabe(r.starts_at),
      ends_at: fuerEingabe(r.ends_at),
      capacity: r.capacity == null ? "" : String(r.capacity),
      rsvp_deadline: fuerEingabe(r.rsvp_deadline),
    });
  }

  function speichern(daten: Record<string, string>, published?: boolean) {
    setFehler(null);
    start(async () => {
      const res = await saveReception({
        ...(daten.id ? { id: daten.id } : {}),
        title_de: daten.title_de,
        title_en: daten.title_en,
        description_de: daten.description_de,
        description_en: daten.description_en,
        location: daten.location,
        address: daten.address,
        starts_at: daten.starts_at,
        ends_at: daten.ends_at,
        capacity: daten.capacity,
        rsvp_deadline: daten.rsvp_deadline,
        ...(published === undefined ? {} : { published }),
      });
      if (!res.ok) {
        setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setOffen(null);
      toast("success", t.saved);
      router.refresh();
    });
  }

  function umschalten(r: ReceptionRow) {
    start(async () => {
      const res = await saveReception({ id: r.id, published: !r.published });
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", r.published ? t.unpublished : t.published);
      router.refresh();
    });
  }

  function loeschen(r: ReceptionRow) {
    start(async () => {
      setAskDelete(null);
      const res = await removeReception(r.id);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.deleted);
      router.refresh();
    });
  }

  function gaesteZeigen(r: ReceptionRow) {
    start(async () => {
      const res = await loadGuests(r.id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      setGaeste({ id: r.id, rows: res.data });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            setFehler(null);
            setOffen({ ...LEER });
          }}
        >
          {t.add}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((r) => {
            const frei = r.capacity == null ? null : Math.max(r.capacity - r.taken, 0);
            return (
              <Card as="li" key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="ct-h3 text-ink">{r.title_de}</h2>
                      <Badge tone={r.published ? "success" : "neutral"}>
                        {r.published ? t.statusPublished : t.statusDraft}
                      </Badge>
                    </div>
                    <p className="ct-help mt-1 tabular-nums">
                      {dateTime.format(new Date(r.starts_at))}
                      {r.ends_at ? ` – ${dateTime.format(new Date(r.ends_at))}` : ""} ·{" "}
                      {r.location}
                      {r.address ? `, ${r.address}` : ""}
                    </p>
                    {r.rsvp_deadline && (
                      <p className="ct-help mt-1 tabular-nums">
                        {t.deadline}: {dateTime.format(new Date(r.rsvp_deadline))}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => bearbeiten(r)}>
                      {t.edit}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => umschalten(r)} disabled={pending}>
                      {r.published ? t.unpublish : t.publish}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAskDelete(r)} disabled={pending}>
                      {t.delete}
                    </Button>
                  </div>
                </div>

                {/* Plätze und Zusagen nebeneinander: die Obergrenze zählt
                    Plätze, die Gästeliste zählt Menschen. */}
                <dl className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div>
                    <dt className="ct-help">{t.statTaken}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">
                      {r.taken}
                      {r.capacity != null && <span className="ct-help"> / {r.capacity}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statFree}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{frei ?? t.unlimited}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statYes}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">{r.yes_count}</dd>
                  </div>
                  <div>
                    <dt className="ct-help">{t.statResponded}</dt>
                    <dd className="ct-h3 text-ink tabular-nums">
                      {r.yes_count + r.no_count}
                      <span className="ct-help"> / {r.invited_count}</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <Button size="sm" variant="secondary" onClick={() => gaesteZeigen(r)} disabled={pending}>
                    {t.showGuests}
                  </Button>
                </div>

                {gaeste?.id === r.id && (
                  <div className="mt-4 overflow-x-auto">
                    {gaeste.rows.length === 0 ? (
                      <p className="ct-help">{t.noGuests}</p>
                    ) : (
                      <Table>
                        <Thead>
                          <Th>{t.colName}</Th>
                          <Th>{t.colStatus}</Th>
                          <Th>{t.colGuests}</Th>
                          <Th>{t.colNote}</Th>
                        </Thead>
                        <Tbody>
                          {gaeste.rows.map((g) => (
                            <Tr key={g.profile_id}>
                              <Td>
                                {[g.first_name, g.last_name].filter(Boolean).join(" ") || "—"}
                              </Td>
                              <Td>
                                <Badge tone={g.status === "yes" ? "success" : "neutral"}>
                                  {t[`rsvp_${g.status}`] ?? g.status}
                                </Badge>
                              </Td>
                              <Td className="tabular-nums">{g.guests}</Td>
                              <Td className="ct-help">{g.note ?? "—"}</Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </ul>
      )}

      {offen && (
        <Drawer open error={fehler} onClose={() => setOffen(null)} title={offen.id ? t.edit : t.add}>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              speichern(offen);
            }}
          >

            {RECEPTION_FIELDS.map((f) => (
              <Field
                key={f.key}
                label={t[`field_${f.key}`] ?? f.key}
                htmlFor={`r-${f.key}`}
                hint={t[`field_${f.key}_hint`]}
                required={f.required}
                requiredLabel={common.required}
              >
                <Input
                  id={`r-${f.key}`}
                  type={f.kind === "text" ? "text" : f.kind}
                  min={f.kind === "number" ? 1 : undefined}
                  value={offen[f.key] ?? ""}
                  onChange={(e) => setOffen({ ...offen, [f.key]: e.target.value })}
                />
              </Field>
            ))}

            <Field label={t.field_description_de} htmlFor="r-desc-de">
              <Textarea
                id="r-desc-de"
                rows={3}
                value={offen.description_de}
                onChange={(e) => setOffen({ ...offen, description_de: e.target.value })}
              />
            </Field>
            <Field label={t.field_description_en} htmlFor="r-desc-en">
              <Textarea
                id="r-desc-en"
                rows={3}
                value={offen.description_en}
                onChange={(e) => setOffen({ ...offen, description_en: e.target.value })}
              />
            </Field>

            <div className="flex gap-2">
              <Button type="submit" loading={pending}>
                {common.save}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOffen(null)}>
                {common.cancel}
              </Button>
            </div>
          </form>
        </Drawer>
      )}

      {askDelete && (
        <ConfirmDialog
          title={t.deleteTitle}
          body={t.deleteBody}
          detail={<p className="ct-label">{askDelete.title_de}</p>}
          confirmLabel={t.delete}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setAskDelete(null)}
          onConfirm={() => loeschen(askDelete)}
        />
      )}
    </div>
  );
}
