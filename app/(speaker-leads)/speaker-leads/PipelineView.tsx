"use client";

import { useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { cn } from "@/components/ui/cn";
import { NewSpeakerDrawer } from "./NewSpeakerDrawer";
import type { EinordnungOptionen } from "@/components/speaker/Einordnung";
import { fristStand, heute } from "@/lib/speaker/verlauf";
import { SpeakerFenster } from "./SpeakerFenster";
import {
  PIPELINE_BESTAETIGT,
  PIPELINE_ORDER,
  PIPELINE_VOR_ZUSAGE,
  type ManagedSpeaker,
  type ManagerOption,
  type ManagerScope,
  type PipelineAnsicht,
} from "./types";

type Strings = Record<string, string>;

/** Hat die früheste offene Aufgabe ihre Frist schon gerissen? (LEAD-039) */
function istUeberfaellig(s: ManagedSpeaker, heuteIso: string): boolean {
  return Boolean(s.next_task && fristStand(s.next_task.due_on, heuteIso) === "ueberfaellig");
}

/** Prio als Marke mit Text (LEAD-039): A hebt sich ab, B und C bleiben ruhig. */
const PRIO_TONE: Record<string, BadgeTone> = { a: "accent", b: "neutral", c: "neutral" };

const PIPELINE_TONE: Record<string, BadgeTone> = {
  lead: "neutral",
  contacted: "neutral",
  confirmed: "accent",
  onboarded: "accent",
  ready: "success",
  published: "success",
  attended: "success",
  declined: "error",
};

export function PipelineView({
  ansicht,
  scope,
  speakers,
  managers,
  labels,
  einordnungOptionen,
  locale,
  dateLocale,
  t,
  te,
  verlaufArten,
  tv,
  tg,
  common,
  rpcMessages,
}: {
  /** Pipeline (vor der Zusage) oder Bestätigte Speaker (Onboarding), LEAD-028. */
  ansicht: PipelineAnsicht;
  scope: ManagerScope;
  speakers: ManagedSpeaker[];
  managers: ManagerOption[];
  labels: Record<string, Record<string, string>>;
  /** Auswahllisten der Einordnung im Fenster (LEAD-039). */
  einordnungOptionen: EinordnungOptionen;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  /** `speakerEinordnung`-Texte. */
  te: Strings;
  /** Bezeichnungen aus `speaker_activity_kind` (Verlauf, LEAD-039 Schnitt 2). */
  verlaufArten: Record<string, string>;
  /** `speakerVerlauf`-Texte. */
  tv: Strings;
  /** `speakerGast`-Texte (SPK-070). */
  tg: Strings;
  common: {
    cancel: string;
    choose: string;
    close: string;
    none: string;
    required: string;
    save: string;
  };
  rpcMessages: Record<string, string>;
}) {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  // Filter der Einordnung (LEAD-039) und nach Betreuung — nebeneinander, nicht
  // untereinander (dieselbe Bitte wie LEAD-049 für die Programmtabelle).
  const [prio, setPrio] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [cluster, setCluster] = useState("");
  const [betreuung, setBetreuung] = useState("");
  // SPK-070: Gäste der Partner (0188) sind zugesagt, aber kein Fall fürs Team —
  // sie stehen erst auf Wunsch in der Liste, dann mit „Gast“.
  const [gaesteZeigen, setGaesteZeigen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" });
  // Einmal je Mount: der Kalendertag hängt an der Uhr, und im Rendern darf
  // nichts Unreines stehen, sonst gibt der React-Compiler die Memos auf.
  const [heuteIso] = useState(() => heute());
  const meId = scope.person_id;
  const ueberfaellig = (s: ManagedSpeaker) => istUeberfaellig(s, heuteIso);
  const fristDatum = (iso: string) => dateTime.format(new Date(`${iso}T12:00:00`));
  const name = (s: ManagedSpeaker) =>
    [s.title, s.first_name, s.last_name].filter(Boolean).join(" ") || common.none;

  // Nur die Stände dieser Seite (LEAD-028). Das Schubfach sucht weiter in allen
  // Speakern: wer hier gerade bestätigt wurde, bleibt offen, bis man es schliesst.
  const bereich = ansicht === "pipeline" ? PIPELINE_VOR_ZUSAGE : PIPELINE_BESTAETIGT;
  const imBereichAlle = useMemo(
    () => speakers.filter((s) => bereich.includes(s.pipeline_status)),
    [speakers, bereich],
  );
  // SPK-070: die Tabelle zeigt Gäste nur auf Wunsch — „Fällig“ nimmt den ganzen
  // Bereich, eine eigene Aufgabe verschwindet nicht hinter dem Schalter.
  const imBereich = useMemo(
    () => (gaesteZeigen ? imBereichAlle : imBereichAlle.filter((s) => !s.stage_guest)),
    [imBereichAlle, gaesteZeigen],
  );
  const gaesteImBereich = imBereichAlle.filter((s) => s.stage_guest).length;

  /** Wer in diesem Bereich wirklich betreut — plus „ohne Betreuung“. */
  const betreuende = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of imBereich) if (s.owner_person_id && s.owner_name) m.set(s.owner_person_id, s.owner_name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [imBereich]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return imBereich
      .filter((s) => (!status || s.pipeline_status === status))
      .filter((s) => !prio || s.priority === prio)
      .filter((s) => !kategorie || s.category === kategorie)
      .filter((s) => !cluster || s.topic_cluster === cluster)
      .filter((s) =>
        !betreuung ? true : betreuung === "none" ? !s.owner_person_id : s.owner_person_id === betreuung,
      )
      .filter(
        (s) =>
          !term ||
          [s.first_name, s.last_name, s.organization_name, s.job_title, s.email]
            .filter(Boolean)
            .some((v) => v!.toLowerCase().includes(term)),
      )
      .sort(
        (a, b) =>
          // Überfällige Wiedervorlagen oben (LEAD-039): wer eine Frist gerissen
          // hat, steht vor dem Rest — danach wie bisher nach Stand und Name.
          Number(istUeberfaellig(b, heuteIso)) - Number(istUeberfaellig(a, heuteIso)) ||
          PIPELINE_ORDER.indexOf(a.pipeline_status) -
            PIPELINE_ORDER.indexOf(b.pipeline_status) ||
          (a.last_name ?? "").localeCompare(b.last_name ?? ""),
      );
  }, [query, imBereich, status, prio, kategorie, cluster, betreuung, heuteIso]);

  /**
   * „Fällig“ (LEAD-027): die eigenen Aufgaben, die heute fällig oder überfällig
   * sind — oben in der Pipeline, mit dem Speaker verknüpft. Gezählt wird die
   * früheste offene Aufgabe je Speaker (`next_task`).
   */
  const faellig = useMemo(
    () =>
      imBereichAlle
        .filter(
          (s) =>
            s.next_task &&
            s.next_task.assignee_person_id === meId &&
            fristStand(s.next_task.due_on, heuteIso) !== "spaeter",
        )
        .sort((a, b) => (a.next_task!.due_on < b.next_task!.due_on ? -1 : 1)),
    [imBereichAlle, meId, heuteIso],
  );

  // Zähler je Stand — der Überblick, den ein Lead zuerst braucht.
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of imBereich) m.set(s.pipeline_status, (m.get(s.pipeline_status) ?? 0) + 1);
    return m;
  }, [imBereich]);

  const selected = speakers.find((s) => s.id === openId) ?? null;
  // Die Edition für „Speaker anlegen" und die Board-Vorauswahl: bei genau einer
  // im Scope ist sie gesetzt, sonst wählt man sie im Formular.
  const editions = scope.editions;

  return (
    <div className="flex flex-col gap-4">
      {faellig.length > 0 && (
        <section aria-labelledby="pipeline-faellig" className="rounded-ct-lg border border-warning-soft bg-warning-soft p-4">
          <h2 id="pipeline-faellig" className="ct-label text-ink">
            {tv.faelligTitle} ({faellig.length})
          </h2>
          <p className="ct-help mb-2">{tv.faelligHint}</p>
          <ul className="flex flex-col gap-1">
            {faellig.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={ueberfaellig(s) ? "error" : "warning"}>
                  {ueberfaellig(s) ? tv.overdue : tv.dueToday}
                </Badge>
                <button type="button" onClick={() => setOpenId(s.id)} className="ct-link text-left">
                  {name(s)}
                </button>
                <span className="ct-small text-ink">{s.next_task!.body}</span>
                {ueberfaellig(s) && <span className="ct-help">{tv.dueOn.replace("{date}", fristDatum(s.next_task!.due_on))}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Zähler je Pipeline-Stand */}
      <div className="flex flex-wrap gap-1" role="group" aria-label={t.filterStatus}>
        <button
          type="button"
          aria-pressed={status === ""}
          onClick={() => setStatus("")}
          className={cn(
            "rounded-ct-sm px-2.5 py-1.5 ct-label",
            status === ""
              ? "bg-accent-soft text-accent-deep"
              : "text-muted hover:bg-surface-hover hover:text-ink",
          )}
        >
          {t.allStatuses} ({imBereich.length})
        </button>
        {PIPELINE_ORDER.filter((s) => bereich.includes(s) && counts.has(s)).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-ct-sm px-2.5 py-1.5 ct-label",
              status === s
                ? "bg-accent-soft text-accent-deep"
                : "text-muted hover:bg-surface-hover hover:text-ink",
            )}
          >
            {labels.pipeline[s] ?? s} ({counts.get(s)})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.search} htmlFor="lead-search" className="min-w-65">
            <Input
              id="lead-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label={te.priority} htmlFor="lead-prio" className="min-w-36">
            <Select
              id="lead-prio"
              value={prio}
              placeholder={te.all}
              options={Object.entries(einordnungOptionen.priority).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setPrio(e.target.value)}
            />
          </Field>
          <Field label={te.category} htmlFor="lead-kategorie" className="min-w-44">
            <Select
              id="lead-kategorie"
              value={kategorie}
              placeholder={te.all}
              options={Object.entries(einordnungOptionen.category).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setKategorie(e.target.value)}
            />
          </Field>
          <Field label={te.topicCluster} htmlFor="lead-cluster" className="min-w-52">
            <Select
              id="lead-cluster"
              value={cluster}
              placeholder={te.all}
              options={Object.entries(einordnungOptionen.topic_cluster).map(([value, label]) => ({ value, label }))}
              onChange={(e) => setCluster(e.target.value)}
            />
          </Field>
          {gaesteImBereich > 0 && (
            <label className="flex min-h-10 items-center gap-2 self-end ct-label text-ink">
              <input
                type="checkbox"
                className="size-4"
                checked={gaesteZeigen}
                onChange={(e) => setGaesteZeigen(e.target.checked)}
              />
              {tg.show} ({gaesteImBereich})
            </label>
          )}
          <Field label={t.colOwner} htmlFor="lead-betreuung" className="min-w-44">
            <Select
              id="lead-betreuung"
              value={betreuung}
              placeholder={te.all}
              options={[
                { value: "none", label: te.noOwner },
                ...betreuende.map(([value, label]) => ({ value, label })),
              ]}
              onChange={(e) => setBetreuung(e.target.value)}
            />
          </Field>
        </div>
        {/* Neue Speaker beginnen in der Pipeline, nicht bei den Bestätigten. */}
        {ansicht === "pipeline" && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setCreating(true)}>
              {t.newSpeaker}
            </Button>
          </div>
        )}
      </div>

      {imBereich.length === 0 ? (
        <EmptyState
          title={ansicht === "pipeline" ? t.pipelineEmptyTitle : t.confirmedEmptyTitle}
          description={ansicht === "pipeline" ? t.pipelineEmptyBody : t.confirmedEmptyBody}
        />
      ) : visible.length === 0 ? (
        <EmptyState title={t.noMatchTitle} description={t.noMatchBody} />
      ) : ansicht === "bestaetigt" ? (
        <BestaetigtTabelle
          speakers={visible}
          labels={labels}
          locale={locale}
          dateTime={dateTime}
          name={name}
          t={t}
          tg={tg}
          none={common.none}
          onOpen={setOpenId}
        />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colName}</Th>
            <Th>{t.colRole}</Th>
            <Th>{t.colStatus}</Th>
            <Th>{te.priority}</Th>
            <Th>{te.title}</Th>
            <Th>{tv.nextStep}</Th>
            <Th>{t.colOwner}</Th>
          </Thead>
          <Tbody>
            {visible.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <button
                    type="button"
                    onClick={() => setOpenId(s.id)}
                    className="ct-link text-left"
                  >
                    {name(s)}
                  </button>
                  {s.stage_guest && <Badge className="ml-2">{tg.badge}</Badge>}
                  <div className="ct-help">
                    {[s.job_title, s.organization_name].filter(Boolean).join(" · ")}
                  </div>
                </Td>
                <Td className="text-muted">
                  {labels.speakerType[s.speaker_type] ?? s.speaker_type}
                </Td>
                <Td>
                  <Badge tone={PIPELINE_TONE[s.pipeline_status] ?? "neutral"}>
                    {labels.pipeline[s.pipeline_status] ?? s.pipeline_status}
                  </Badge>
                  {s.invited_at && (
                    <div className="ct-help">
                      {t.invitedOn} {dateTime.format(new Date(s.invited_at))}
                    </div>
                  )}
                  {s.last_activity_at && (
                    <div className="ct-help">
                      {tv.lastActivity.replace("{date}", dateTime.format(new Date(s.last_activity_at)))}
                    </div>
                  )}
                </Td>
                <Td>
                  {s.priority ? (
                    <Badge tone={PRIO_TONE[s.priority] ?? "neutral"}>
                      {einordnungOptionen.priority[s.priority] ?? s.priority}
                    </Badge>
                  ) : (
                    <span className="ct-help">{common.none}</span>
                  )}
                </Td>
                {/* Einordnung aus der Arbeitstabelle (LEAD-039): Kategorie und
                    Cluster, darunter Thema oder Rolle. */}
                <Td className="max-w-72">
                  {s.category || s.topic_cluster || s.topic_role ? (
                    <div className="flex flex-col gap-0.5">
                      {(s.category || s.topic_cluster) && (
                        <span className="text-ink">
                          {[
                            s.category ? (einordnungOptionen.category[s.category] ?? s.category) : null,
                            s.topic_cluster ? (einordnungOptionen.topic_cluster[s.topic_cluster] ?? s.topic_cluster) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                      {s.topic_role && <span className="line-clamp-2 ct-help">{s.topic_role}</span>}
                    </div>
                  ) : (
                    <span className="ct-help">{common.none}</span>
                  )}
                </Td>
                {/* Vor der Zusage zählt, wo die Ansprache steht (LEAD-039): der
                    nächste Schritt aus dem Verlauf statt der freien Notiz — die
                    steht weiter im Fenster. */}
                <Td className="max-w-80">
                  {s.next_task ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="line-clamp-2 ct-small text-ink">{s.next_task.body}</span>
                      <span className="flex flex-wrap items-center gap-1 ct-help">
                        {ueberfaellig(s) ? (
                          <Badge tone="error">{tv.overdue}</Badge>
                        ) : fristStand(s.next_task.due_on, heuteIso) === "heute" ? (
                          <Badge tone="warning">{tv.dueToday}</Badge>
                        ) : null}
                        {tv.dueOn.replace("{date}", fristDatum(s.next_task.due_on))}
                        {(s.open_tasks ?? 0) > 1 && ` · ${tv.moreTasks.replace("{n}", String((s.open_tasks ?? 1) - 1))}`}
                      </span>
                    </div>
                  ) : (
                    <span className="ct-help">{common.none}</span>
                  )}
                </Td>
                <Td className="text-muted">{s.owner_name || common.none}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      {selected && (
        <SpeakerFenster
          key={selected.id}
          speaker={selected}
          isTeam={scope.team}
          managers={managers}
          meId={scope.person_id}
          labels={labels}
          einordnungOptionen={einordnungOptionen}
          locale={locale}
          dateLocale={dateLocale}
          t={t}
          te={te}
          verlaufArten={verlaufArten}
          tv={tv}
          tg={tg}
          common={common}
          rpcMessages={rpcMessages}
          onClose={() => setOpenId(null)}
        />
      )}

      {creating && (
        <NewSpeakerDrawer
          editions={editions}
          speakerTypes={labels.speakerType}
          canSearchPeople={scope.team}
          t={t}
          common={common}
          rpcMessages={rpcMessages}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

/**
 * Bestätigte Speaker: das Onboarding auf einen Blick (LEAD-028).
 *
 * Konrad: „fehlende Infos, Session, Einladung ins Portal, Eintrag ins
 * Programm". Genau diese vier Fragen beantwortet je eine Spalte — was fehlt
 * (dieselben offenen Schritte wie im Speaker-Portal), welche Session, ob die
 * Einladung raus ist und ob die Session im Programm steht.
 */
function BestaetigtTabelle({
  speakers,
  labels,
  locale,
  dateTime,
  name,
  t,
  tg,
  none,
  onOpen,
}: {
  speakers: ManagedSpeaker[];
  labels: Record<string, Record<string, string>>;
  locale: Locale;
  dateTime: Intl.DateTimeFormat;
  name: (s: ManagedSpeaker) => string;
  t: Strings;
  tg: Strings;
  none: string;
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <Thead>
        <Th>{t.colName}</Th>
        <Th>{t.colStatus}</Th>
        <Th>{t.colSessions}</Th>
        <Th>{t.colInvite}</Th>
        <Th>{t.colMissing}</Th>
        <Th>{t.colProgramme}</Th>
        <Th>{t.colOwner}</Th>
      </Thead>
      <Tbody>
        {speakers.map((s) => {
          const sessions = s.sessions ?? [];
          return (
            <Tr key={s.id}>
              <Td>
                <button type="button" onClick={() => onOpen(s.id)} className="ct-link text-left">
                  {name(s)}
                </button>
                {s.stage_guest && <Badge className="ml-2">{tg.badge}</Badge>}
                <div className="ct-help">{[s.job_title, s.organization_name].filter(Boolean).join(" · ")}</div>
              </Td>
              <Td>
                <Badge tone={PIPELINE_TONE[s.pipeline_status] ?? "neutral"}>
                  {labels.pipeline[s.pipeline_status] ?? s.pipeline_status}
                </Badge>
                {s.confirmed_at && (
                  <div className="ct-help">
                    {t.confirmedOn} {dateTime.format(new Date(s.confirmed_at))}
                  </div>
                )}
              </Td>
              <Td className="text-muted">
                {sessions.length === 0 ? (
                  <Badge tone="warning">{t.noSession}</Badge>
                ) : (
                  sessions.map((se) => (
                    <div key={se.session_id}>
                      <span className="text-ink">
                        {(locale === "en" ? se.title_en : se.title_de) ?? se.title_de ?? "—"}
                      </span>
                      {(se.start_at || se.stage_name) && (
                        <span className="ct-help block">
                          {[se.start_at ? dateTime.format(new Date(se.start_at)) : null, se.stage_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </Td>
              {/* SPK-070: ein Gast wird nicht eingeladen und macht kein Onboarding —
                  statt Warnungen steht da, wer ihn pflegt. */}
              <Td>
                {s.stage_guest ? (
                  <span className="ct-help">—</span>
                ) : s.invited_at ? (
                  <span className="ct-help">
                    {t.invitedOn} {dateTime.format(new Date(s.invited_at))}
                  </span>
                ) : (
                  <Badge tone="warning">{t.notInvited}</Badge>
                )}
              </Td>
              <Td>
                {s.stage_guest ? (
                  <span className="ct-help">{tg.viaPartner}</span>
                ) : (s.next_open ?? []).length === 0 ? (
                  <Badge tone="success">{t.allDone}</Badge>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {(s.next_open ?? []).map((step) => (
                      <Badge key={step}>{t[`step_${step}`] ?? step}</Badge>
                    ))}
                  </div>
                )}
              </Td>
              <Td>
                {sessions.length === 0 ? (
                  <span className="ct-help">—</span>
                ) : (
                  <div className="flex flex-col items-start gap-1">
                    {sessions.map((se) => (
                      <Badge key={se.session_id} tone={se.publish_status === "published" ? "success" : "neutral"}>
                        {labels.publishStatus?.[se.publish_status ?? ""] ?? se.publish_status ?? none}
                      </Badge>
                    ))}
                  </div>
                )}
              </Td>
              <Td className="text-muted">{s.owner_name || (s.stage_guest ? tg.viaPartner : none)}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}
