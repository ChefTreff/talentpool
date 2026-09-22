"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  removeDay,
  removeStage,
  removeTrack,
  saveDay,
  saveStage,
  saveStageDay,
  saveTrack,
  type EditionResult,
} from "./actions";
import { BUEHNEN_ARTEN, type Geruest, type GeruestBuehnenTag } from "./types";

type Strings = Record<string, string>;
type Entwurf = Record<string, Record<string, string>>;

/**
 * Das Grundgerüst der Edition: Tage, Bühnen, Öffnungszeiten, Tracks.
 *
 * Diese vier Dinge gab es bisher nur als Tabellen — angelegt hat sie eine
 * Migration im September, und wer 2027 eine Bühne umbenennen wollte, brauchte
 * eine Entwicklerin. Die Seite ist deshalb bewusst **dicht und direkt**: keine
 * Dialoge, keine Zwischenschritte, in jeder Zeile stehen die Felder selbst.
 * Wer eine Öffnungszeit korrigiert, tippt sie und drückt Speichern.
 *
 * Die Zahl der Slots steht in jeder Zeile — nicht als Statistik, sondern weil
 * sie entscheidet, ob gelöscht werden kann. Der Löschknopf ist deshalb aus,
 * solange etwas daran hängt, **mit der Zahl daneben**: „geht nicht" ohne Grund
 * ist das, was man später als Fehler meldet.
 */
export function GeruestView({
  geruest,
  t,
  common,
  rpcMessages,
}: {
  geruest: Geruest;
  t: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [entwurf, setEntwurf] = useState<Entwurf>({});
  const [weg, setWeg] = useState<{ art: "tag" | "buehne" | "track"; id: string; name: string } | null>(null);

  const eventId = geruest.event?.id ?? "";
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function report(res: EditionResult<string>, okText: string) {
    if (res.ok) {
      toast("success", okText);
      setEntwurf({});
      router.refresh();
      return;
    }
    // `in_use` trägt im Detail, was hängt (`slots:30`) — das gehört in den Satz.
    const detail = res.detail ? ` (${res.detail})` : "";
    toast("error", message(res.key) + detail);
  }

  /** Feldwert: erst der Entwurf, sonst der gespeicherte Stand. */
  const wert = (id: string, feld: string, stand: string | number | null) =>
    entwurf[id]?.[feld] ?? (stand === null || stand === undefined ? "" : String(stand));

  const setzen = (id: string, feld: string, v: string) =>
    setEntwurf((e) => ({ ...e, [id]: { ...(e[id] ?? {}), [feld]: v } }));

  const geaendert = (id: string) => Object.keys(entwurf[id] ?? {}).length > 0;

  /** Uhrzeiten kommen als `09:00:00` aus der Datenbank; das Feld will `09:00`. */
  const zeit = (v: string | null) => (v ? v.slice(0, 5) : "");

  const lauf = (fn: () => Promise<EditionResult<string>>, ok: string) =>
    startTransition(async () => report(await fn(), ok));

  return (
    <div className="flex flex-col gap-6">
      {/* --- Tage ---------------------------------------------------------- */}
      <AbschnittsNavigation
        label={t.sectionsLabel}
        items={[
          { id: "tage", label: t.daysTitle },
          { id: "buehnen", label: t.stagesTitle },
          { id: "zeiten", label: t.hoursTitle },
          { id: "tracks", label: t.tracksTitle },
        ]}
      />

      <Card id="tage">
        <CardHeader title={t.daysTitle} description={t.daysHint} />
        <Table>
          <Thead>
            <Th>{t.colDate}</Th>
            <Th>{t.colLabel}</Th>
            <Th>{t.colDoors}</Th>
            <Th>{t.colStart}</Th>
            <Th>{t.colEnd}</Th>
            <Th numeric>{t.colSlots}</Th>
            <Th />
          </Thead>
          <Tbody>
            {geruest.days.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <Input
                    type="date"
                    aria-label={t.colDate}
                    value={wert(d.id, "day_date", d.day_date)}
                    onChange={(e) => setzen(d.id, "day_date", e.target.value)}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t.colLabel}
                    value={wert(d.id, "label_de", d.label_de)}
                    onChange={(e) => setzen(d.id, "label_de", e.target.value)}
                  />
                </Td>
                {(["doors_open", "programme_start", "programme_end"] as const).map((f) => (
                  <Td key={f}>
                    <Input
                      type="time"
                      aria-label={t[`col${f}`] ?? f}
                      value={wert(d.id, f, zeit(d[f]))}
                      onChange={(e) => setzen(d.id, f, e.target.value)}
                    />
                  </Td>
                ))}
                <Td numeric>{d.slots}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !geaendert(d.id)}
                      onClick={() => lauf(() => saveDay({ id: d.id, ...entwurf[d.id] }), t.saved)}
                    >
                      {common.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || d.slots > 0}
                      title={d.slots > 0 ? `${d.slots} ${t.slotsAttached}` : undefined}
                      onClick={() => setWeg({ art: "tag", id: d.id, name: d.day_date })}
                    >
                      {t.remove}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
            <NeueZeile
              felder={[
                { key: "day_date", type: "date", label: t.colDate, required: true },
                { key: "label_de", label: t.colLabel },
                { key: "doors_open", type: "time", label: t.colDoors },
                { key: "programme_start", type: "time", label: t.colStart },
                { key: "programme_end", type: "time", label: t.colEnd },
              ]}
              spalten={7}
              addLabel={t.addDay}
              pending={pending}
              onAdd={(werte) => lauf(() => saveDay({ event_id: eventId, ...werte }), t.added)}
            />
          </Tbody>
        </Table>
      </Card>

      {/* --- Bühnen -------------------------------------------------------- */}
      <Card id="buehnen">
        <CardHeader title={t.stagesTitle} description={t.stagesHint} />
        <Table>
          <Thead>
            <Th>{t.colName}</Th>
            <Th>{t.colType}</Th>
            <Th>{t.colRoom}</Th>
            <Th numeric>{t.colCapacity}</Th>
            <Th numeric>{t.colChangeover}</Th>
            <Th numeric>{t.colDuration}</Th>
            <Th>{t.colPartner}</Th>
            <Th numeric>{t.colSlots}</Th>
            <Th />
          </Thead>
          <Tbody>
            {geruest.stages.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <Input
                    aria-label={t.colName}
                    value={wert(s.id, "name", s.name)}
                    onChange={(e) => setzen(s.id, "name", e.target.value)}
                  />
                  {!s.active && <Badge className="mt-1">{t.inactive}</Badge>}
                </Td>
                <Td>
                  <Select
                    aria-label={t.colType}
                    value={wert(s.id, "type", s.type)}
                    onChange={(e) => setzen(s.id, "type", e.target.value)}
                    options={BUEHNEN_ARTEN.map((a) => ({ value: a, label: t[`stageType_${a}`] ?? a }))}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t.colRoom}
                    value={wert(s.id, "room", s.room)}
                    onChange={(e) => setzen(s.id, "room", e.target.value)}
                  />
                </Td>
                {(["capacity", "changeover_min", "default_duration_min"] as const).map((f) => (
                  <Td key={f} numeric>
                    <Input
                      type="number"
                      className="text-right"
                      aria-label={t[`col${f}`] ?? f}
                      value={wert(s.id, f, s[f])}
                      onChange={(e) => setzen(s.id, f, e.target.value)}
                    />
                  </Td>
                ))}
                <Td>
                  <span className="ct-help text-muted">{s.partner_org_name ?? "—"}</span>
                </Td>
                <Td numeric>{s.slots}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !geaendert(s.id)}
                      onClick={() => lauf(() => saveStage({ id: s.id, ...entwurf[s.id] }), t.saved)}
                    >
                      {common.save}
                    </Button>
                    {/* Eine Bühne mit Slots wird nicht gelöscht, sondern
                        stillgelegt — der Weg steht in der Zeile daneben. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        s.slots > 0
                          ? lauf(() => saveStage({ id: s.id, active: !s.active }), t.saved)
                          : setWeg({ art: "buehne", id: s.id, name: s.name })
                      }
                    >
                      {s.slots > 0 ? (s.active ? t.deactivate : t.activate) : t.remove}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
            <NeueZeile
              felder={[
                { key: "name", label: t.colName, required: true },
                { key: "type", label: t.colType, options: BUEHNEN_ARTEN.map((a) => ({ value: a, label: t[`stageType_${a}`] ?? a })) },
                { key: "room", label: t.colRoom },
                { key: "capacity", type: "number", label: t.colCapacity },
                { key: "changeover_min", type: "number", label: t.colChangeover },
                { key: "default_duration_min", type: "number", label: t.colDuration },
              ]}
              spalten={9}
              addLabel={t.addStage}
              pending={pending}
              onAdd={(werte) => lauf(() => saveStage({ event_id: eventId, ...werte }), t.added)}
            />
          </Tbody>
        </Table>
      </Card>

      {/* --- Öffnungszeiten ------------------------------------------------ */}
      <Card id="zeiten">
        <CardHeader title={t.hoursTitle} description={t.hoursHint} />
        {geruest.days.length === 0 || geruest.stages.length === 0 ? (
          <p className="ct-small text-muted">{t.hoursNeedsBoth}</p>
        ) : (
          <Table>
            <Thead>
              <Th>{t.colStage}</Th>
              {geruest.days.map((d) => (
                <Th key={d.id}>{d.label_de || d.day_date}</Th>
              ))}
            </Thead>
            <Tbody>
              {geruest.stages.map((s) => (
                <Tr key={s.id}>
                  <Td>{s.name}</Td>
                  {geruest.days.map((d) => {
                    const sd = geruest.stage_days.find(
                      (x) => x.stage_id === s.id && x.event_day_id === d.id,
                    );
                    return (
                      <Td key={d.id}>
                        <Zelle
                          sd={sd}
                          stageId={s.id}
                          dayId={d.id}
                          t={t}
                          pending={pending}
                          onSave={(werte) =>
                            lauf(
                              () => saveStageDay({ stage_id: s.id, event_day_id: d.id, ...werte }),
                              t.saved,
                            )
                          }
                        />
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      {/* --- Tracks -------------------------------------------------------- */}
      <Card id="tracks">
        <CardHeader title={t.tracksTitle} description={t.tracksHint} />
        <Table>
          <Thead>
            <Th>{t.colNameDe}</Th>
            <Th>{t.colNameEn}</Th>
            <Th>{t.colSlug}</Th>
            <Th numeric>{t.colSessions}</Th>
            <Th />
          </Thead>
          <Tbody>
            {geruest.tracks.map((tr) => (
              <Tr key={tr.id}>
                <Td>
                  <Input
                    aria-label={t.colNameDe}
                    value={wert(tr.id, "name_de", tr.name_de)}
                    onChange={(e) => setzen(tr.id, "name_de", e.target.value)}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t.colNameEn}
                    value={wert(tr.id, "name_en", tr.name_en)}
                    onChange={(e) => setzen(tr.id, "name_en", e.target.value)}
                  />
                </Td>
                <Td>
                  <Input
                    aria-label={t.colSlug}
                    value={wert(tr.id, "slug", tr.slug)}
                    onChange={(e) => setzen(tr.id, "slug", e.target.value)}
                  />
                </Td>
                <Td numeric>{tr.sessions}</Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !geaendert(tr.id)}
                      onClick={() => lauf(() => saveTrack({ id: tr.id, ...entwurf[tr.id] }), t.saved)}
                    >
                      {common.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || tr.sessions > 0}
                      title={tr.sessions > 0 ? `${tr.sessions} ${t.sessionsAttached}` : undefined}
                      onClick={() => setWeg({ art: "track", id: tr.id, name: tr.name_de })}
                    >
                      {t.remove}
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
            <NeueZeile
              felder={[
                { key: "name_de", label: t.colNameDe, required: true },
                { key: "name_en", label: t.colNameEn },
                { key: "slug", label: t.colSlug },
              ]}
              spalten={5}
              addLabel={t.addTrack}
              pending={pending}
              onAdd={(werte) => lauf(() => saveTrack({ event_id: eventId, ...werte }), t.added)}
            />
          </Tbody>
        </Table>
      </Card>

      {weg && (
        <ConfirmDialog
          title={`${t.remove}: ${weg.name}`}
          body={t.removeBody}
          confirmLabel={t.remove}
          cancelLabel={common.cancel}
          pending={pending}
          onCancel={() => setWeg(null)}
          onConfirm={() => {
            const { art, id } = weg;
            setWeg(null);
            lauf(
              () => (art === "tag" ? removeDay(id) : art === "buehne" ? removeStage(id) : removeTrack(id)),
              t.removed,
            );
          }}
        />
      )}
    </div>
  );
}

/** Öffnungszeit und Kontingent einer Bühne an einem Tag. */
function Zelle({
  sd,
  stageId,
  dayId,
  t,
  pending,
  onSave,
}: {
  sd: GeruestBuehnenTag | undefined;
  stageId: string;
  dayId: string;
  t: Strings;
  pending: boolean;
  onSave: (werte: Record<string, string>) => void;
}) {
  const [von, setVon] = useState(sd?.open_from?.slice(0, 5) ?? "");
  const [bis, setBis] = useState(sd?.open_to?.slice(0, 5) ?? "");
  const [quote, setQuote] = useState(sd?.slot_quota == null ? "" : String(sd.slot_quota));

  const stand = `${sd?.open_from?.slice(0, 5) ?? ""}|${sd?.open_to?.slice(0, 5) ?? ""}|${
    sd?.slot_quota == null ? "" : sd.slot_quota
  }`;
  const jetzt = `${von}|${bis}|${quote}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input type="time" aria-label={`${t.colOpenFrom} ${stageId} ${dayId}`} value={von} onChange={(e) => setVon(e.target.value)} />
        <span aria-hidden className="text-muted">–</span>
        <Input type="time" aria-label={t.colOpenTo} value={bis} onChange={(e) => setBis(e.target.value)} />
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          className="text-right"
          aria-label={t.colQuota}
          placeholder={t.colQuota}
          value={quote}
          onChange={(e) => setQuote(e.target.value)}
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || jetzt === stand}
          onClick={() => onSave({ open_from: von, open_to: bis, slot_quota: quote })}
        >
          ✓
        </Button>
      </div>
    </div>
  );
}

type Feld = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
};

/** Die letzte Zeile jeder Tabelle: anlegen, ohne die Seite zu wechseln. */
function NeueZeile({
  felder,
  spalten,
  addLabel,
  pending,
  onAdd,
}: {
  felder: Feld[];
  spalten: number;
  addLabel: string;
  pending: boolean;
  onAdd: (werte: Record<string, string>) => void;
}) {
  const [werte, setWerte] = useState<Record<string, string>>({});
  const vollstaendig = felder.every((f) => !f.required || (werte[f.key] ?? "").trim() !== "");

  return (
    <Tr>
      <Td colSpan={spalten}>
        <div className="flex flex-wrap items-end gap-2">
          {felder.map((f) =>
            f.options ? (
              <Select
                key={f.key}
                aria-label={f.label}
                className="w-40"
                value={werte[f.key] ?? f.options[0]?.value ?? ""}
                options={f.options}
                onChange={(e) => setWerte((w) => ({ ...w, [f.key]: e.target.value }))}
              />
            ) : (
              <Input
                key={f.key}
                type={f.type}
                aria-label={f.label}
                placeholder={f.label}
                className="w-40"
                value={werte[f.key] ?? ""}
                onChange={(e) => setWerte((w) => ({ ...w, [f.key]: e.target.value }))}
              />
            ),
          )}
          <Button
            size="sm"
            disabled={pending || !vollstaendig}
            onClick={() => {
              onAdd(werte);
              setWerte({});
            }}
          >
            {addLabel}
          </Button>
        </div>
      </Td>
    </Tr>
  );
}
