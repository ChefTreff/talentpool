"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { searchBoardPeople, setSessionOwner, setSessionSpeakers, setSlotStatus, upsertSession } from "./actions";
import { fehlerText } from "./fehler";
import { speakerName, SLOT_STATUS_ORDER, type BoardDay, type BoardLabels, type BoardSlot, type BoardStage } from "./types";
import { abgeleiteteNamen, ownerOptionen, verantwortlich, type OwnerCandidate, type SessionVerantwortung } from "./verantwortung";

type Strings = Record<string, string>;

const STATUS_TONE: Record<string, BadgeTone> = {
  open: "neutral",
  requested: "warning",
  confirmed_title_open: "accent",
  final: "success",
  unused: "neutral",
};

const PUBLISH_TONE: Record<string, BadgeTone> = {
  draft: "neutral",
  review: "warning",
  published: "success",
  cancelled: "error",
};

type SortKey = "stage" | "day" | "time" | "title" | "format" | "status";

/**
 * Das Programm als Liste (Feedback-Runde 1, Punkt 6, Vorbild Airtable 2026).
 *
 * Das Kalender-Board bleibt — es beantwortet „wann liegt was nebeneinander".
 * Die Tabelle beantwortet die andere Hälfte: „was fehlt noch, wo hängt es".
 * Deshalb über **alle** Tage, sortier- und filterbar, und die vier Felder, die
 * beim Füllen andauernd angefasst werden, direkt in der Zeile: Titel, Format,
 * Status, Speaker.
 *
 * Geschrieben wird über dieselben RPCs wie im Board. `can_edit` kommt je Zeile
 * aus der Datenbank; wo es fehlt, steht der Wert als Text da. Die Tabelle
 * erfindet keine eigene Rechteregel — sie zeigt nur, was sie vorfindet.
 */
export function ProgrammeTable({
  rows,
  stages,
  days,
  labels,
  locale,
  timezone,
  verantwortliche,
  ownerCandidates = [],
  canSetOwner = false,
  t,
  rpcMessages,
}: {
  rows: BoardSlot[];
  stages: BoardStage[];
  days: BoardDay[];
  labels: BoardLabels;
  locale: string;
  timezone: string;
  /**
   * ADM-018: Verantwortung je Session. Ohne diese Angabe (Partner-Sicht) fehlt
   * die Spalte ganz; setzen darf nur die Programmleitung (`canSetOwner`).
   */
  verantwortliche?: Record<string, SessionVerantwortung>;
  ownerCandidates?: OwnerCandidate[];
  canSetOwner?: boolean;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [stage, setStage] = useState("");
  const [day, setDay] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "time", desc: false });
  const [openSpeakers, setOpenSpeakers] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const time = useMemo(
    () => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: timezone }),
    [locale, timezone],
  );
  const date = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: timezone }),
    [locale, timezone],
  );

  function run(action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) {
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        toast("error", fehlerText(message, { key: res.key ?? "unknown", detail: res.detail }));
        return;
      }
      toast("success", okText);
      router.refresh();
    });
  }

  const title = (r: BoardSlot) => (locale === "en" ? r.title_en ?? r.title_de : r.title_de ?? r.title_en) ?? "";

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const sorted = rows.filter((r) => {
      if (stage && r.stage_id !== stage) return false;
      if (day && r.event_day_id !== day) return false;
      if (status && r.slot_status !== status) return false;
      if (!needle) return true;
      const haystack = [
        r.title_de,
        r.title_en,
        r.stage_name,
        ...(r.speakers ?? []).map(speakerName),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    const key = sort.key;
    const value = (r: BoardSlot) => {
      switch (key) {
        case "stage":
          return r.stage_name ?? "";
        case "day":
          return r.day_date ?? "";
        case "title":
          return title(r).toLowerCase();
        case "format":
          return labels.format[r.format ?? ""] ?? "";
        case "status":
          // Nach dem Fortschritt sortieren, nicht alphabetisch: offen zuerst.
          return String(SLOT_STATUS_ORDER.indexOf(r.slot_status as never)).padStart(2, "0");
        default:
          return r.start_at ?? "";
      }
    };
    return [...sorted].sort((a, b) => {
      const cmp = value(a).localeCompare(value(b), locale);
      // Gleichstand nach Zeit — sonst springen Zeilen bei jedem Sortieren.
      return (cmp !== 0 ? cmp : (a.start_at ?? "").localeCompare(b.start_at ?? "")) * (sort.desc ? -1 : 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, stage, day, status, query, sort, locale, labels]);

  const head = (key: SortKey, label: string) => (
    <Th sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold text-ink transition-colors hover:text-accent-strong"
        onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : false }))}
      >
        {label}
        <span aria-hidden="true" className="text-muted">
          {sort.key === key ? (sort.desc ? "▾" : "▴") : ""}
        </span>
      </button>
    </Th>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          aria-label={t.filterSearch}
          placeholder={t.filterSearch}
          className="w-56"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select
          aria-label={t.colStage}
          className="w-44"
          value={stage}
          options={[{ value: "", label: t.filterAllStages }, ...stages.map((s) => ({ value: s.id, label: s.name }))]}
          onChange={(e) => setStage(e.target.value)}
        />
        <Select
          aria-label={t.colDay}
          className="w-44"
          value={day}
          options={[
            { value: "", label: t.filterAllDays },
            ...days.map((d) => ({
              value: d.id,
              label: (locale === "en" ? d.label_en ?? d.label_de : d.label_de ?? d.label_en) ?? d.day_date,
            })),
          ]}
          onChange={(e) => setDay(e.target.value)}
        />
        <Select
          aria-label={t.colStatus}
          className="w-44"
          value={status}
          options={[
            { value: "", label: t.filterAllStatus },
            ...SLOT_STATUS_ORDER.map((s) => ({ value: s, label: labels.slotStatus[s] ?? s })),
          ]}
          onChange={(e) => setStatus(e.target.value)}
        />
        <span className="ct-help tabular-nums">
          {t.rowCount.replace("{n}", String(visible.length)).replace("{total}", String(rows.length))}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            {head("stage", t.colStage)}
            {head("day", t.colDay)}
            {head("time", t.colTime)}
            {head("title", t.colTitle)}
            {head("format", t.colFormat)}
            <Th>{t.colSpeakers}</Th>
            {verantwortliche && <Th>{t.colOwner}</Th>}
            {head("status", t.colStatus)}
            <Th>{t.colPublish}</Th>
          </Thead>
          <Tbody>
            {visible.map((r) => (
              <Row
                key={r.slot_id}
                row={r}
                labels={labels}
                locale={locale}
                t={t}
                pending={pending}
                date={date}
                time={time}
                title={title(r)}
                speakersOpen={openSpeakers === r.slot_id}
                onToggleSpeakers={() => setOpenSpeakers((id) => (id === r.slot_id ? null : r.slot_id))}
                verantwortung={
                  verantwortliche
                    ? { zeile: r.session_id ? verantwortliche[r.session_id] : undefined, kandidaten: ownerCandidates, darfSetzen: canSetOwner }
                    : null
                }
                run={run}
              />
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function Row({
  row,
  labels,
  locale,
  t,
  pending,
  date,
  time,
  title,
  speakersOpen,
  onToggleSpeakers,
  verantwortung,
  run,
}: {
  row: BoardSlot;
  labels: BoardLabels;
  locale: string;
  t: Strings;
  pending: boolean;
  date: Intl.DateTimeFormat;
  time: Intl.DateTimeFormat;
  title: string;
  speakersOpen: boolean;
  onToggleSpeakers: () => void;
  /** ADM-018; `null` = Spalte ausgeblendet. */
  verantwortung: { zeile: SessionVerantwortung | undefined; kandidaten: OwnerCandidate[]; darfSetzen: boolean } | null;
  run: (action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [draft, setDraft] = useState(title);
  const editable = row.can_edit && !pending;
  const titleField = locale === "en" ? "title_en" : "title_de";

  return (
    <Tr>
      <Td className="text-muted">{row.stage_name}</Td>
      <Td className="text-muted tabular-nums">{date.format(new Date(row.start_at))}</Td>
      <Td className="tabular-nums text-muted">
        {time.format(new Date(row.start_at))}–{time.format(new Date(row.end_at))}
      </Td>
      <Td>
        {row.session_id && row.can_edit ? (
          <Input
            aria-label={t.colTitle}
            className="w-full min-w-[16rem]"
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (draft === title) return;
              run(upsertSession({ id: row.session_id!, [titleField]: draft }), t.saved);
            }}
          />
        ) : (
          <span className={cn("ct-label", !title && "text-muted")}>{title || t.noSession}</span>
        )}
      </Td>
      <Td>
        {row.session_id && row.can_edit ? (
          <Select
            aria-label={t.colFormat}
            className="w-40"
            value={row.format ?? ""}
            disabled={pending}
            options={Object.entries(labels.format).map(([value, label]) => ({ value, label }))}
            onChange={(e) => run(upsertSession({ id: row.session_id!, format: e.target.value }), t.saved)}
          />
        ) : (
          <span className="text-muted">{labels.format[row.format ?? ""] ?? "—"}</span>
        )}
      </Td>
      <Td>
        <SpeakerCell
          row={row}
          t={t}
          editable={editable}
          open={speakersOpen}
          onToggle={onToggleSpeakers}
          run={run}
        />
      </Td>
      {verantwortung && (
        <Td>
          <OwnerCell row={row} {...verantwortung} pending={pending} t={t} run={run} />
        </Td>
      )}
      <Td>
        {row.can_edit ? (
          <Select
            aria-label={t.colStatus}
            className="w-44"
            value={row.slot_status}
            disabled={pending}
            options={SLOT_STATUS_ORDER.map((s) => ({ value: s, label: labels.slotStatus[s] ?? s }))}
            onChange={(e) => run(setSlotStatus(row.slot_id, e.target.value), t.saved)}
          />
        ) : (
          <Badge tone={STATUS_TONE[row.slot_status] ?? "neutral"}>
            {labels.slotStatus[row.slot_status] ?? row.slot_status}
          </Badge>
        )}
      </Td>
      <Td>
        {row.publish_status ? (
          <Badge tone={PUBLISH_TONE[row.publish_status] ?? "neutral"}>
            {labels.publishStatus[row.publish_status] ?? row.publish_status}
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        )}
      </Td>
    </Tr>
  );
}

/**
 * Verantwortlich (ADM-018): für die Programmleitung eine Auswahl — leer heisst
 * „aus den Stage Leads“, sonst ein Lead der Veranstaltung —, für alle anderen
 * der Name mit dem Hinweis, woher er kommt. Ohne Session gibt es nichts zu
 * verantworten.
 */
function OwnerCell({
  row,
  zeile,
  kandidaten,
  darfSetzen,
  pending,
  t,
  run,
}: {
  row: BoardSlot;
  zeile: SessionVerantwortung | undefined;
  kandidaten: OwnerCandidate[];
  darfSetzen: boolean;
  pending: boolean;
  t: Strings;
  run: (action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const sessionId = row.session_id;
  if (!sessionId) return <span className="text-muted">—</span>;
  if (darfSetzen) {
    // Kurzer Eintrag in der Auswahl, die Namen darunter — sonst schneidet das
    // Feld sie ab, sobald zwei Leads an der Bühne stehen.
    const namen = abgeleiteteNamen(zeile);
    return (
      <div className="flex flex-col gap-1">
        <Select
          aria-label={t.colOwner}
          className="w-52"
          value={zeile?.owner_person_id ?? ""}
          disabled={pending}
          placeholder={t.ownerDerived}
          options={ownerOptionen(zeile, kandidaten)}
          onChange={(e) => run(setSessionOwner(sessionId, e.target.value || null), t.ownerSaved)}
        />
        <span className="ct-help">{zeile?.owner_person_id ? t.ownerOverridden : namen || t.ownerNobody}</span>
      </div>
    );
  }
  const v = verantwortlich(zeile);
  if (!v) return <span className="ct-help">{t.ownerNobody}</span>;
  return (
    <span className="ct-small">
      {v.namen}
      <span className="ct-help block">{v.uebersteuert ? t.ownerOverridden : t.ownerDerivedHelp}</span>
    </span>
  );
}

/**
 * Speaker je Zeile: vorhandene als Chip mit „entfernen", dazu eine Suche zum
 * Einzeln-Hinzufügen (Punkt 6: „Speaker einzeln hinzufügen direkt in der
 * Zeile"). Geschrieben wird über `set_session_speakers` — die RPC ersetzt die
 * ganze Liste, also schickt die Zelle immer den vollständigen Stand.
 */
function SpeakerCell({
  row,
  t,
  editable,
  open,
  onToggle,
  run,
}: {
  row: BoardSlot;
  t: Strings;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  run: (action: Promise<{ ok: boolean; key?: string; detail?: string }>, okText: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [searching, startSearch] = useTransition();
  const speakers = row.speakers ?? [];

  const write = (next: { person_id: string; confirmed: boolean }[]) =>
    run(
      setSessionSpeakers(
        row.session_id!,
        next.map((s, i) => ({ ...s, sort_order: i })),
      ),
      t.saved,
    );

  if (!row.session_id) return <span className="text-muted">—</span>;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {speakers.length === 0 && <span className="ct-help">{t.noSpeakers}</span>}
        {speakers.map((s) => (
          // Bestätigt = grün, offen = neutral. Die Farbe wiederholt nur, was
          // der Name ohnehin sagt; die Information steht im Text.
          <Badge key={s.person_id} tone={s.confirmed ? "success" : "neutral"}>
            {speakerName(s)}
            {editable && (
              <button
                type="button"
                aria-label={t.removeSpeaker.replace("{name}", speakerName(s))}
                className="text-muted transition-colors hover:text-error-ink"
                onClick={() =>
                  write(
                    speakers
                      .filter((x) => x.person_id !== s.person_id)
                      .map((x) => ({ person_id: x.person_id, confirmed: x.confirmed ?? false })),
                  )
                }
              >
                ×
              </button>
            )}
          </Badge>
        ))}
        {editable && (
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {open ? t.close : t.addSpeaker}
          </Button>
        )}
      </div>

      {open && editable && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <Input
              aria-label={t.searchPerson}
              placeholder={t.searchPerson}
              className="w-52"
              value={query}
              onChange={(e) => {
                const q = e.target.value;
                setQuery(q);
                if (q.trim().length < 2) {
                  setHits([]);
                  return;
                }
                // Board-Suche statt `searchPeople` — die alte verlangt admin, ein
                // Stage Lead bekam 42501 (LEAD-019/020).
                startSearch(async () =>
                  setHits(
                    (await searchBoardPeople(row.event_id, q)).map(({ id, name }) => ({ id, name })),
                  ),
                );
              }}
            />
            {searching && <span className="ct-help">{t.searching}</span>}
          </div>
          {hits.length > 0 && (
            <ul className="flex flex-col gap-0.5 rounded-ct-sm border bg-surface p-1">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="ct-label w-full rounded-ct-sm px-2 py-1 text-left transition-colors hover:bg-surface-hover"
                    onClick={() => {
                      if (speakers.some((s) => s.person_id === p.id)) return;
                      write([
                        ...speakers.map((s) => ({ person_id: s.person_id, confirmed: s.confirmed ?? false })),
                        { person_id: p.id, confirmed: false },
                      ]);
                      setQuery("");
                      setHits([]);
                      onToggle();
                    }}
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
