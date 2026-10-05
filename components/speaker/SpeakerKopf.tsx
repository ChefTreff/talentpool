"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Select } from "@/components/ui/Select";
import { Stufenleiste } from "@/components/ui/Stufenleiste";
import {
  STAENDE_VOR_ZUSAGE,
  STUFEN,
  alsNaechstes,
  hauptaktion,
  kannZusageMelden,
  warNachZusage,
  type Hauptaktion,
} from "@/app/(speaker-leads)/speaker-leads/phase";
import { PIPELINE_ORDER, type ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";
import { fristStand, heute } from "@/lib/speaker/verlauf";

type Strings = Record<string, string>;

/** Was der Kopf vom Speaker wissen muss — das Fenster der Leads und das Admin-Detail liefern dieselben Felder. */
export type KopfSpeaker = Pick<
  ManagedSpeaker,
  | "pipeline_status"
  | "confirmed_at"
  | "declined_at"
  | "decline_reason"
  | "owner_person_id"
  | "owner_name"
  | "email"
  | "invited_at"
  | "hospitality_status"
  | "travel_costs_covered"
  | "travel_costs_approved"
  | "sessions"
  | "stage_guest"
  | "next_task"
> & {
  /** PART-091: der Partner verwaltet alles (Admin-Detail) — dann gibt es keine Einladung des Speakers. */
  mail_via?: unknown;
};

/** Das Ergebnis einer Aktion, wie es die Server-Actions des Lead-Portals und des Admins beide liefern. */
export type KopfErgebnis = { ok: true; data?: unknown } | { ok: false; key: string; detail?: string };

/** Die drei Wege, die der Kopf selbst geht — der Rest (Einladung) läuft über die Rückfrage des Aufrufers. */
export type KopfAktionen = {
  setPipeline: (status: string, grund?: string) => Promise<KopfErgebnis>;
  handover: (personId: string | null) => Promise<KopfErgebnis>;
  approveTravel: () => Promise<KopfErgebnis>;
};

/** Der Wörterbuch-Schlüssel des Knopftextes je Hauptaktion. */
const AKTION_TEXT: Record<Hauptaktion, string> = {
  contact: "actionContact",
  confirm: "confirmAction",
  invite: "actionInvite",
  hospitality: "actionHospitality",
  travel: "actionTravel",
  session: "actionSession",
};

/**
 * Springt zu einem Block und klappt ihn auf. Ein Anker (`#id`) täte es auch, aber er schriebe die Adresse um und liefe beim
 * zweiten Klick ins Leere (`hashchange` kommt nur, wenn sich der Anker ändert).
 */
export function springeZu(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ block: "start" });
}

/**
 * Der Kopf eines Speakers unterhalb von Name und Badges (LEAD-055, Entwurf von Design: `docs/design-vorschlaege-2026-10-05.md`):
 * **eine Hauptaktion**, „Weitere Aktionen“ mit ihren Panels, die Stufenleiste und die Zeile „Betreut von · Als Nächstes · E-Mail“.
 * Gemeinsam für das Personen-Fenster der Leads und das Admin-Detail — dieselben Aktionen, dieselben Texte, dieselben Regeln
 * (`phase.ts`); wer das Fenster kennt, kennt die Seite.
 *
 * Was den Stand ändert oder weitergibt, läuft über ein **Panel unter der Zeile** — kein Dialog über dem Dialog. Was eine Mail an
 * den Speaker auslöst (die Einladung), fragt der **Aufrufer** vorher (`onEinladen`): er kennt die Adresse und zeigt die Rückfrage.
 * Die Aktionen selbst führt der Aufrufer aus (`onRun`): Toast, Aktualisieren und wo ein Fehler steht (im Fenster, nicht als Toast)
 * unterscheiden sich zwischen Fenster und Seite.
 */
export function SpeakerKopf({
  speaker,
  name,
  team,
  ownerOptionen,
  darfWeitergeben,
  ohneBetreuung = false,
  pending,
  onRun,
  onEinladen,
  aktionen,
  blockPrefix,
  boardPfad,
  labels,
  t,
  tv,
  common,
  dateLocale,
}: {
  speaker: KopfSpeaker;
  /** Für den Toast der Zusage („{name} hat bestätigt …“). */
  name: string;
  /** Speaker-Team: nur es erledigt Hospitality, Reisekosten und die Zuordnung im Programm. */
  team: boolean;
  /** Mögliche Empfänger einer Übergabe. */
  ownerOptionen: { value: string; label: string }[];
  /** Das Team darf jeden zuordnen, eine Lead-Person nur abgeben, was sie heute selbst betreut (Migration 0103). */
  darfWeitergeben: boolean;
  /** Das Admin-Detail darf die Betreuung auch leeren; das Fenster der Leads nicht. */
  ohneBetreuung?: boolean;
  pending: boolean;
  /** Eine Aktion ausführen: Toast und Aktualisieren bei Erfolg, der Fehler dort, wo der Aufrufer ihn zeigt. */
  onRun: (aktion: () => Promise<KopfErgebnis>, okText: string, danach?: () => void) => void;
  /** Die Einladung ist eine Mail an den Speaker: der Aufrufer fragt vorher und nennt die Adresse. */
  onEinladen: () => void;
  aktionen: KopfAktionen;
  /** Vorsilbe der Block-Ids des Aufrufers (`fenster-`, `block-`), damit „Hospitality festlegen“ dorthin springt. */
  blockPrefix: string;
  /** Das Programmboard, zu dem „Im Programmboard zuordnen“ führt. */
  boardPfad: string;
  labels: { pipeline: Record<string, string>; declineReason: Record<string, string> };
  /** `leads`-Texte. */
  t: Strings;
  /** `speakerVerlauf`-Texte (Überfällig, Heute fällig, Fällig am …). */
  tv: Strings;
  common: { cancel: string; choose: string; none: string };
  dateLocale: string;
}) {
  /** Das eine Aktionspanel unter der Aktionszeile. */
  const [panel, setPanel] = useState<null | "absage" | "stand" | "weitergeben">(null);
  const [grund, setGrund] = useState("");
  const [neuerStand, setNeuerStand] = useState("");
  const [nachfolge, setNachfolge] = useState("");

  const nachZusage = warNachZusage(speaker);
  const abgesagt = speaker.pipeline_status === "declined";
  const gast = speaker.stage_guest;
  const aktion = hauptaktion(speaker, team);
  const naechstes = alsNaechstes(speaker);

  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const datum = (iso: string) => dateTime.format(new Date(iso));
  // Fristen sind Kalendertage ohne Uhrzeit — um 12 Uhr gelesen, damit die Zeitzone den Tag nicht verschiebt.
  const fristDatum = (iso: string) => dateTime.format(new Date(`${iso}T12:00:00`));
  const [heuteIso] = useState(() => heute());

  const opt = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => ({ value, label }));
  const standName = (s: string) => (s === "confirmed" && !nachZusage ? t.confirmAction : (labels.pipeline[s] ?? s));
  const stufe = Math.max(0, STUFEN.indexOf(speaker.pipeline_status));

  // Stände, die „Stand ändern …“ anbietet: die der Phase, ohne den jetzigen — die Absage hat ihren eigenen Menüpunkt.
  const standOptionen = PIPELINE_ORDER.filter(
    (s) => (nachZusage || STAENDE_VOR_ZUSAGE.includes(s)) && s !== speaker.pipeline_status && s !== "declined",
  ).map((s) => ({ value: s, label: standName(s) }));

  // Die Einladung gibt es nicht für Gäste von Partnern (`invite_speaker`, 0188) und nicht, wenn der Partner alles verwaltet.
  const darfErneutEinladen = !gast && !speaker.mail_via && nachZusage && !abgesagt && Boolean(speaker.invited_at);
  const aktuellerOwner = speaker.owner_person_id ?? "";
  const weitergabeBereit = ohneBetreuung ? nachfolge !== aktuellerOwner : nachfolge !== "";

  function onHauptaktion(a: Hauptaktion) {
    if (a === "contact") onRun(() => aktionen.setPipeline("contacted"), t.pipelineSaved);
    else if (a === "confirm") onRun(() => aktionen.setPipeline("confirmed"), t.confirmedMoved.replace("{name}", name));
    else if (a === "invite") onEinladen();
    else if (a === "hospitality") springeZu(`${blockPrefix}hospitality`);
    else if (a === "travel") onRun(() => aktionen.approveTravel(), t.travelApproved);
    // `session` ist ein Link ins Programmboard und läuft nicht über diese Funktion.
  }

  return (
    <>
      {/* … die eine Hauptaktion und die weiteren … */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {aktion === "session" ? (
          <ButtonLink key="hauptaktion" href={boardPfad} className="max-sm:w-full">
            {t[AKTION_TEXT.session]}
          </ButtonLink>
        ) : (
          aktion && (
            <Button key="hauptaktion" className="max-sm:w-full" loading={pending} onClick={() => onHauptaktion(aktion)}>
              {t[AKTION_TEXT[aktion]]}
            </Button>
          )
        )}
        <Menu ton="hell" label={t.moreActions} trigger={<span>{t.moreActions}</span>}>
          {darfWeitergeben && (
            <MenuItem
              onSelect={() => {
                setPanel("weitergeben");
                setNachfolge(ohneBetreuung ? aktuellerOwner : "");
              }}
            >
              {t.handoverMenu}
            </MenuItem>
          )}
          <MenuItem
            onSelect={() => {
              setPanel("stand");
              setNeuerStand("");
            }}
          >
            {t.changeStage}
          </MenuItem>
          {darfErneutEinladen && <MenuItem onSelect={onEinladen}>{t.inviteAgain}</MenuItem>}
          {!abgesagt && (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  setPanel("absage");
                  setGrund(speaker.decline_reason ?? "");
                }}
              >
                {t.declineMenu}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      {kannZusageMelden(speaker.pipeline_status) && <p className="ct-help mt-2">{t.pipelineLockedHint}</p>}

      {/* Das Aktionspanel: kein Dialog über dem Dialog. */}
      {panel === "absage" && (
        <div className="mt-3 flex flex-col gap-2 rounded-ct-md border bg-canvas p-3">
          {/* Bei einer Absage fragen wir nach dem Grund, bevor wir umschalten — hinterher trägt ihn niemand mehr nach, und
              für die nächste Edition ist er mehr wert als die Absage. */}
          <Field label={t.declineReason} htmlFor="absage-grund" hint={t.declineReasonHint}>
            <Select
              id="absage-grund"
              value={grund}
              placeholder={common.choose}
              options={opt(labels.declineReason)}
              onChange={(e) => setGrund(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || grund === ""}
              onClick={() => onRun(() => aktionen.setPipeline("declined", grund), t.pipelineSaved, () => setPanel(null))}
            >
              {t.declineConfirm}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel(null)}>
              {common.cancel}
            </Button>
          </div>
        </div>
      )}
      {panel === "stand" && (
        <div className="mt-3 flex flex-col gap-2 rounded-ct-md border bg-canvas p-3">
          <Field label={t.changeStageLabel} htmlFor="stand-neu" hint={t.pipelineHint}>
            <Select
              id="stand-neu"
              value={neuerStand}
              placeholder={common.choose}
              options={standOptionen}
              onChange={(e) => setNeuerStand(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || neuerStand === ""}
              onClick={() => onRun(() => aktionen.setPipeline(neuerStand), t.pipelineSaved, () => setPanel(null))}
            >
              {t.changeStageConfirm}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel(null)}>
              {common.cancel}
            </Button>
          </div>
        </div>
      )}
      {panel === "weitergeben" && (
        <div className="mt-3 flex flex-col gap-2 rounded-ct-md border bg-canvas p-3">
          {/* Angeboten wird das nur, wo es auch erlaubt ist: das Team darf jeden zuordnen, eine Lead-Person nur abgeben, was
              sie heute selbst betreut (Migration 0103). Der Eintrag für alle wäre bei der Hälfte der Zeilen eine Einladung in
              den Fehler. */}
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t.handoverTo} htmlFor="nachfolge" className="min-w-52 grow">
              <Select
                id="nachfolge"
                value={nachfolge}
                placeholder={ohneBetreuung ? t.withoutOwner : common.choose}
                options={ownerOptionen}
                onChange={(e) => setNachfolge(e.target.value)}
              />
            </Field>
            <Button
              size="sm"
              disabled={pending || !weitergabeBereit}
              onClick={() =>
                onRun(() => aktionen.handover(nachfolge || null), t.handedOver, () => {
                  setPanel(null);
                  setNachfolge("");
                })
              }
            >
              {t.handoverAction}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setPanel(null)}>
              {common.cancel}
            </Button>
          </div>
        </div>
      )}

      {/* … wo er steht … */}
      <Stufenleiste
        className="mt-4"
        label={t.stageLabel}
        zaehler={t.stageCounter.replace("{n}", String(stufe + 1)).replace("{m}", String(STUFEN.length))}
        schritte={STUFEN.map((s) => ({ key: s, label: labels.pipeline[s] ?? s }))}
        aktuell={speaker.pipeline_status}
        ende={abgesagt ? t.stageEnded : undefined}
      />

      {/* … und was als Nächstes zu tun ist. */}
      <dl className="mt-3 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-6">
        <div className="flex gap-1.5">
          <dt className="ct-label text-muted">{t.currentOwner}</dt>
          <dd className="ct-small text-ink">{speaker.owner_name || common.none}</dd>
        </div>
        {naechstes.art === "abgesagt" ? (
          <div>
            <dd className="ct-small font-semibold text-error-ink">
              {speaker.declined_at ? t.declinedLine.replace("{date}", datum(speaker.declined_at)) : t.stageEnded}
              {speaker.decline_reason && ` · ${labels.declineReason[speaker.decline_reason] ?? speaker.decline_reason}`}
            </dd>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            <dt className="ct-label text-muted">{t.nextLabel}</dt>
            <dd className="ct-small text-ink">
              {naechstes.art === "pflicht" && t[`duty_${naechstes.pflicht}`]}
              {naechstes.art === "aufgabe" && speaker.next_task && (
                <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="line-clamp-2">{speaker.next_task.body}</span>
                  {fristStand(speaker.next_task.due_on, heuteIso) === "ueberfaellig" ? (
                    <Badge tone="error">{tv.overdue}</Badge>
                  ) : fristStand(speaker.next_task.due_on, heuteIso) === "heute" ? (
                    <Badge tone="warning">{tv.dueToday}</Badge>
                  ) : null}
                  <span className="ct-help">{tv.dueOn.replace("{date}", fristDatum(speaker.next_task.due_on))}</span>
                </span>
              )}
              {naechstes.art === "nichts" && (nachZusage && !gast ? t.dutiesDone : t.noNextStep)}
            </dd>
          </div>
        )}
        {/* Kontakt: die RPC gibt die Adresse nur im Scope heraus. */}
        {speaker.email ? (
          <div className="flex gap-1.5">
            <dt className="ct-label text-muted">{t.contactEmail}</dt>
            <dd className="ct-small min-w-0 break-all text-ink">{speaker.email}</dd>
          </div>
        ) : (
          <div>
            <dd className="ct-help">{t.contactHidden}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
