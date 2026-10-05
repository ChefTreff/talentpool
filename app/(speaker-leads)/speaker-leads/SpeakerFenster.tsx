"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Block } from "@/components/ui/Block";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { InfoList } from "@/components/ui/InfoList";
import { Input, Textarea } from "@/components/ui/Input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { ConfirmDialog, Modal, ModalFuss } from "@/components/ui/Modal";
import { PortraitShape } from "@/components/ui/PortraitShape";
import { Select } from "@/components/ui/Select";
import { Stufenleiste } from "@/components/ui/Stufenleiste";
import { useToast } from "@/components/ui/Toast";
import { EinordnungFelder, type EinordnungOptionen } from "@/components/speaker/Einordnung";
import { Verlauf } from "@/components/speaker/Verlauf";
import { PhotoUpload } from "@/components/speaker/PhotoUpload";
import {
  buehnenGeaendert,
  einordnungAenderungen,
  einordnungEntwurf,
  kontaktViaHatAdresse,
} from "@/lib/speaker/einordnung";
import { fristStand, heute } from "@/lib/speaker/verlauf";
import {
  approveTravelCosts,
  handoverSpeaker,
  inviteSpeaker,
  registerSpeakerPhotoAsLead,
  setPipeline,
  speakerFoto,
  setStageCandidates,
  updateSpeaker,
  type LeadResult,
} from "./actions";
import { PIPELINE_ORDER, type ManagedSpeaker, type ManagerOption } from "./types";
import {
  STAENDE_VOR_ZUSAGE,
  STUFEN,
  alsNaechstes,
  aufraeumen,
  blockMarken,
  hauptaktion,
  kannZusageMelden,
  naechstePflichten,
  warNachZusage,
  type Hauptaktion,
  type PflichtBlock,
} from "./phase";
import { entwurfGeaendert, fensterEntwurf } from "./entwurf";

type Strings = Record<string, string>;

/** Der Wörterbuch-Schlüssel des Knopftextes je Hauptaktion. */
const AKTION_TEXT: Record<Hauptaktion, string> = {
  contact: "actionContact",
  confirm: "confirmAction",
  invite: "actionInvite",
  hospitality: "actionHospitality",
  travel: "actionTravel",
  session: "actionSession",
};

/** Das Programmboard der Leads — dorthin führt „Im Programmboard zuordnen“. */
const BOARD_PFAD = "/speaker-leads/board";

/**
 * Springt zu einem Block und klappt ihn auf. Ein Anker (`#id`) täte es auch, aber er schriebe die Adresse um und liefe beim
 * zweiten Klick ins Leere (`hashchange` kommt nur, wenn sich der Anker ändert).
 */
function springeZu(id: string) {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  el.scrollIntoView({ block: "start" });
}

/**
 * Ein Speaker als zentrales Fenster (LEAD-026, Konrad 24.09.: „die Seitenleiste ist zu schmal für die Informationsfülle;
 * nach dem Speichern bleibt der Kontakt offen“) — aufgeräumt in LEAD-055 (Konrad und Paulina 05.10.: „noch sehr
 * unübersichtlich“, Entwurf von Design: `docs/design-vorschlaege-2026-10-05.md`).
 *
 * **Oben steht, wer das ist, wo er steht und was als Nächstes zu tun ist; darunter nur Blöcke, von denen offen ist, was zum
 * Stand gehört.**
 *
 * - Der **Kopf** trägt die Rangfolge: Person, **eine** Hauptaktion (`hauptaktion()`), „Weitere Aktionen“ (Menü), die Stufenleiste
 *   und eine Zeile Kontext. Was den Stand ändert oder weitergibt, läuft über Aktionspanels unter der Zeile — kein Dialog über dem
 *   Dialog; nur was eine Mail an den Speaker auslöst (Einladung) und das Verwerfen von Änderungen fragen vorher.
 * - **Fünf Blöcke in fester Reihenfolge** — Grunddaten, Pipeline, Onboarding, Hospitality, Programm —, in einer Spalte. Die
 *   letzten drei gibt es erst nach der Zusage (LEAD-054), Onboarding und Hospitality nicht für Gäste von Partnern (SPK-070). Marken
 *   („Nächste Pflicht“, „Offen · 2“, „Erledigt“) und die Hauptaktion lesen aus `naechstePflichten()` — die eine Quelle.
 * - „Änderungen speichern“ schreibt den Entwurf und schließt das Fenster (LEAD-026), ist aber **zweitrangig**: die eine
 *   primäre Aktion ist die Hauptaktion. Stand-Aktionen schließen es nicht.
 */
export function SpeakerFenster({
  speaker,
  isTeam,
  managers,
  meId,
  labels,
  einordnungOptionen,
  locale,
  dateLocale,
  t,
  te,
  verlaufArten,
  tv,
  tg,
  tf,
  common,
  rpcMessages,
  onClose,
}: {
  speaker: ManagedSpeaker;
  /** Team darf zusätzlich Pass, Lounge, Hotel-Tier und Hospitality setzen. */
  isTeam: boolean;
  /** Mögliche Empfänger einer Übergabe. */
  managers: ManagerOption[];
  /** Die eigene Person — nur wer heute betreut, darf weiterreichen. */
  meId: string;
  labels: Record<string, Record<string, string>>;
  /** Auswahllisten der Einordnung (Vokabular und Bühnen der Edition). */
  einordnungOptionen: EinordnungOptionen;
  locale: Locale;
  dateLocale: string;
  t: Strings;
  /** `speakerEinordnung`-Texte. */
  te: Strings;
  /** Bezeichnungen aus `speaker_activity_kind`. */
  verlaufArten: Record<string, string>;
  /** `speakerVerlauf`-Texte. */
  tv: Strings;
  /** `speakerGast`-Texte (SPK-070). */
  tg: Strings;
  /** Foto-Upload (LEAD-029), Auszug aus `speaker`. */
  tf: Strings;
  common: {
    cancel: string;
    choose: string;
    close: string;
    none: string;
    required: string;
    save: string;
  };
  rpcMessages: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // ADM-062: Fehler stehen im Fenster, nicht als Toast am Bildschirmrand.
  const [fehler, setFehler] = useState<string | null>(null);

  /** Das eine Aktionspanel unter der Aktionszeile — dieselbe Fläche wie früher das Absage-Panel. */
  const [panel, setPanel] = useState<null | "absage" | "stand" | "weitergeben">(null);
  /** Der gewählte Grund einer Absage. */
  const [grund, setGrund] = useState("");
  /** Der gewählte neue Stand (Panel „Stand ändern“). */
  const [neuerStand, setNeuerStand] = useState("");
  /** Empfänger einer Übergabe. */
  const [nachfolge, setNachfolge] = useState("");
  /** Rückfragen: eine Mail an den Speaker und das Verwerfen von Änderungen. */
  const [einladungFrage, setEinladungFrage] = useState(false);
  const [verwerfenFrage, setVerwerfenFrage] = useState(false);

  const [draft, setDraft] = useState(() => fensterEntwurf(speaker));

  // Einordnung (LEAD-039): der gespeicherte Stand und der Entwurf daneben — so
  // geht nur mit, was sich geändert hat.
  const einordnungVorher = useMemo(() => einordnungEntwurf(speaker), [speaker]);
  const [einordnung, setEinordnung] = useState(einordnungVorher);
  const adresse = kontaktViaHatAdresse(einordnung.contact_via);

  // Etwas, das beim Schließen verloren ginge? Dann fragt „Schließen“ und Escape zurück.
  const geaendert = entwurfGeaendert(fensterEntwurf(speaker), draft, isTeam, einordnungVorher, einordnung);
  const schliessen = () => (geaendert ? setVerwerfenFrage(true) : onClose());

  // LEAD-029: das Profilfoto — die Adresse ist signiert und kommt vom Server;
  // nach einem Upload zählt `fotoStand` hoch und holt die neue.
  const [foto, setFoto] = useState<{ url: string | null; editionId: string | null } | null>(null);
  const [fotoStand, setFotoStand] = useState(0);
  useEffect(() => {
    let aktuell = true;
    void speakerFoto(speaker.id).then((f) => {
      if (aktuell) setFoto(f);
    });
    return () => {
      aktuell = false;
    };
  }, [speaker.id, fotoStand]);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const datum = (iso: string) => dateTime.format(new Date(iso));
  // Fristen sind Kalendertage ohne Uhrzeit — um 12 Uhr gelesen, damit die Zeitzone den Tag nicht verschiebt.
  const fristDatum = (iso: string) => dateTime.format(new Date(`${iso}T12:00:00`));
  const [heuteIso] = useState(() => heute());
  const name =
    [speaker.title, speaker.first_name, speaker.last_name].filter(Boolean).join(" ") ||
    common.none;

  // LEAD-054: vor der Zusage nur Grunddaten, Ansprache und Einordnung; mit der
  // Zusage öffnen sich Onboarding, Hospitality und Programm — auch nach einer Absage
  // nach der Zusage, denn dann ist aufzuräumen (LEAD-055).
  const nachZusage = warNachZusage(speaker);
  const abgesagt = speaker.pipeline_status === "declined";
  const gast = speaker.stage_guest;
  const pflichten = naechstePflichten(speaker);
  const marken = blockMarken(pflichten);
  const haengt = aufraeumen(speaker);
  const aktion = hauptaktion(speaker, isTeam);
  const naechstes = alsNaechstes(speaker);

  function report(res: LeadResult, okText: string): boolean {
    if (res.ok) {
      setFehler(null);
      toast("success", okText);
      router.refresh();
      return true;
    }
    setFehler(message(res.key) + (res.detail ? ` (${res.detail})` : ""));
    return false;
  }

  /** Eine Aktion des Fensters: Toast und Aktualisieren bei Erfolg, der Fehler im Fenster sonst. Das Fenster bleibt offen. */
  function fuehreAus(aktionFn: () => Promise<LeadResult>, okText: string, danach?: () => void) {
    startTransition(async () => {
      if (report(await aktionFn(), okText)) danach?.();
    });
  }

  function onHauptaktion(a: Hauptaktion) {
    if (a === "contact") fuehreAus(() => setPipeline(speaker.id, "contacted"), t.pipelineSaved);
    else if (a === "confirm") {
      fuehreAus(() => setPipeline(speaker.id, "confirmed"), t.confirmedMoved.replace("{name}", name));
    } else if (a === "invite") setEinladungFrage(true);
    else if (a === "hospitality") springeZu("fenster-hospitality");
    else if (a === "travel") fuehreAus(() => approveTravelCosts(speaker.id, true), t.travelApproved);
    // `session` ist ein Link ins Programmboard und läuft nicht über diese Funktion.
  }

  function onSave() {
    startTransition(async () => {
      // Team-Felder nur mitschicken, wenn sie erlaubt sind — sonst antwortet
      // die RPC mit `team_only_fields` und nichts wird gespeichert.
      const data: Record<string, unknown> = {
        speaker_type: draft.speaker_type,
        job_title: draft.job_title,
        organization_name: draft.organization_name,
        reception_eligible: draft.reception_eligible,
        travel_costs_covered: draft.travel_costs_covered,
      };
      // Jetzt, wo das Feld den gespeicherten Stand zeigt, ist ein geleertes
      // Feld eine Absicht und keine „keine Angabe" mehr.
      if (draft.internal_notes !== (speaker.internal_notes ?? "")) {
        data.internal_notes = draft.internal_notes;
      }
      if (isTeam) {
        data.pass_type = draft.pass_type;
        data.lounge_access = draft.lounge_access;
        data.hotel_tier = draft.hotel_tier;
        data.hospitality_status = draft.hospitality_status;
      }
      Object.assign(data, einordnungAenderungen(einordnungVorher, einordnung));
      const res = await updateSpeaker(speaker.id, data);
      if (!res.ok) {
        report(res, t.saved);
        return;
      }
      if (buehnenGeaendert(einordnungVorher, einordnung)) {
        const buehnen = await setStageCandidates(speaker.id, einordnung.stage_ids);
        if (!buehnen.ok) {
          // Die Felder stehen schon, nur die Bühnen nicht — das Fenster bleibt offen.
          report(buehnen, t.saved);
          return;
        }
      }
      toast("success", t.saved);
      router.refresh();
      // LEAD-026: nach dem Speichern zu — der neue Stand steht in der Liste.
      onClose();
    });
  }

  const opt = (map: Record<string, string>) =>
    Object.entries(map).map(([value, label]) => ({ value, label }));
  const standName = (s: string) =>
    s === "confirmed" && !nachZusage ? t.confirmAction : (labels.pipeline[s] ?? s);

  // --- Kopf ---------------------------------------------------------------------------------------------------------------
  const untertitel = [speaker.job_title, speaker.organization_name].filter(Boolean).join(" · ");
  const kategorie = speaker.category ? (einordnungOptionen.category[speaker.category] ?? speaker.category) : null;
  // „Prio“ ist die interne Einstufung der Programmleitung: im Kopf nur für das Team (LEAD-053 zieht dieselbe Grenze durch das Fenster).
  const prio = isTeam && speaker.priority ? (einordnungOptionen.priority[speaker.priority] ?? speaker.priority) : null;
  // Die Hotel-Kategorie nur, wenn sie von der Vorgabe abweicht — und nur der Teil vor der Klammer („Premium (Grand Elysée)“).
  const hotelAbweichend = speaker.hotel_tier !== "standard";
  const hotelKurz = (labels.hotelTier[speaker.hotel_tier] ?? speaker.hotel_tier).split(" (")[0];

  const stufe = Math.max(0, STUFEN.indexOf(speaker.pipeline_status));

  // Stände, die „Stand ändern …“ anbietet: die der Phase, ohne den jetzigen — die Absage hat ihren eigenen Menüpunkt.
  const standOptionen = PIPELINE_ORDER.filter(
    (s) => (nachZusage || STAENDE_VOR_ZUSAGE.includes(s)) && s !== speaker.pipeline_status && s !== "declined",
  ).map((s) => ({ value: s, label: standName(s) }));

  const darfWeitergeben = (isTeam || speaker.owner_person_id === meId) && managers.length > 0;
  const darfErneutEinladen = !gast && nachZusage && !abgesagt && Boolean(speaker.invited_at);

  // --- Blöcke -------------------------------------------------------------------------------------------------------------
  /** Marke eines Pflicht-Blocks: aus den offenen Pflichten, nach einer Absage „Aufräumen“, für Gäste keine. */
  const markeVon = (b: PflichtBlock): { text: string; ton: BadgeTone } | undefined => {
    if (gast) return undefined;
    if (abgesagt) return haengt[b] ? { text: t.markCleanup, ton: "warning" } : undefined;
    const m = marken[b];
    if (m.zustand === "erledigt") return { text: t.markDone, ton: "success" };
    if (m.zustand === "naechste") return { text: t.markNext, ton: "accent" };
    return { text: m.n > 1 ? t.markOpenN.replace("{n}", String(m.n)) : t.markOpen, ton: "warning" };
  };
  const offenVon = (b: PflichtBlock) => !gast && !abgesagt && marken[b].zustand === "naechste";

  const sessions = speaker.sessions ?? [];
  const offeneSchritte = speaker.next_open ?? [];
  const nenne = (vorlage: string, werte: Record<string, string>) =>
    Object.entries(werte).reduce((text, [k, v]) => text.replace(`{${k}}`, v), vorlage);
  const teile = (...teile: (string | false | null | undefined)[]) => teile.filter(Boolean).join(" · ") || undefined;

  const kurzGrunddaten = teile(foto !== null && foto.editionId && !foto.url && t.shortNoPhoto, !speaker.internal_notes && t.shortNoNote);
  const offeneAufgaben = speaker.open_tasks ?? 0;
  const kurzPipeline = nachZusage
    ? teile(
        speaker.confirmed_at && nenne(t.shortConfirmedOn, { date: datum(speaker.confirmed_at) }),
        kategorie && nenne(t.shortCategory, { c: kategorie }),
        prio,
      )
    : teile(
        speaker.last_activity_at ? nenne(t.shortActivity, { date: datum(speaker.last_activity_at) }) : t.shortNoActivity,
        offeneAufgaben > 0 && (offeneAufgaben === 1 ? t.shortOneTask : nenne(t.shortTasks, { n: String(offeneAufgaben) })),
      );
  const kurzOnboarding = teile(
    speaker.invited_at ? nenne(t.shortInvited, { date: datum(speaker.invited_at) }) : t.shortNotInvited,
    offeneSchritte.length > 0 && nenne(t.shortStepsOpen, { n: String(offeneSchritte.length) }),
  );
  const kurzHospitality = teile(
    isTeam && `${t.fieldHospitality}: ${labels.hospitality[speaker.hospitality_status] ?? speaker.hospitality_status}`,
    `${t.travel}: ${speaker.travel_costs_covered ? t.travelCoveredYes : t.travelCoveredNo}`,
  );
  const kurzProgramm =
    sessions.length === 0 ? t.shortNoSession : sessions.length === 1 ? t.shortOneSession : nenne(t.shortSessions, { n: String(sessions.length) });

  return (
    <>
      <Modal label={name} onCancel={schliessen} size="wide" error={fehler}>
        {/* Kopf: wer das ist … */}
        <div className="flex items-start gap-3">
          <PortraitShape name={name} photoUrl={foto?.url} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="ct-h3 text-ink">{name}</h2>
            {untertitel && <p className="ct-help">{untertitel}</p>}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge>{labels.speakerType[speaker.speaker_type] ?? speaker.speaker_type}</Badge>
              {kategorie && <Badge>{kategorie}</Badge>}
              {prio && <Badge>{prio}</Badge>}
              {hotelAbweichend && <Badge tone="accent">{nenne(t.hotelBadge, { tier: hotelKurz })}</Badge>}
              {gast && <Badge>{tg.badge}</Badge>}
              {speaker.assistant_name && (
                <Badge tone="accent">
                  {t.assistant}: {speaker.assistant_name}
                </Badge>
              )}
            </div>
          </div>
          {/* Am Handy steht „Schließen“ nur in der Fußleiste: der Name hat die ganze Breite. */}
          <Button variant="ghost" size="sm" className="max-sm:hidden" onClick={schliessen}>
            {common.close}
          </Button>
        </div>
        {/* SPK-070: ein Gast des Partners bekommt weder Einladung noch Onboarding. */}
        {gast && <p className="ct-help mt-2">{tg.hint}</p>}

        {/* … die eine Hauptaktion und die weiteren … */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {aktion === "session" ? (
            <ButtonLink key="hauptaktion" href={BOARD_PFAD} className="max-sm:w-full">
              {t[AKTION_TEXT.session]}
            </ButtonLink>
          ) : (
            aktion && (
              <Button
                key="hauptaktion"
                className="max-sm:w-full"
                loading={pending}
                onClick={() => onHauptaktion(aktion)}
              >
                {t[AKTION_TEXT[aktion]]}
              </Button>
            )
          )}
          <Menu ton="hell" label={t.moreActions} trigger={<span>{t.moreActions}</span>}>
            {darfWeitergeben && (
              <MenuItem
                onSelect={() => {
                  setPanel("weitergeben");
                  setNachfolge("");
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
            {darfErneutEinladen && <MenuItem onSelect={() => setEinladungFrage(true)}>{t.inviteAgain}</MenuItem>}
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
            {/* Bei einer Absage fragen wir nach dem Grund, bevor wir umschalten — hinterher trägt ihn niemand mehr
                nach, und für die nächste Edition ist er mehr wert als die Absage. */}
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
                onClick={() =>
                  fuehreAus(() => setPipeline(speaker.id, "declined", grund), t.pipelineSaved, () => setPanel(null))
                }
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
                onClick={() =>
                  fuehreAus(() => setPipeline(speaker.id, neuerStand), t.pipelineSaved, () => setPanel(null))
                }
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
            {/* Angeboten wird das nur, wo es auch erlaubt ist: das Team darf jeden zuordnen, eine Lead-Person nur abgeben,
                was sie heute selbst betreut (Migration 0103). Der Eintrag für alle wäre bei der Hälfte der Zeilen eine
                Einladung in den Fehler. */}
            <div className="flex flex-wrap items-end gap-2">
              <Field label={t.handoverTo} htmlFor="nachfolge" className="min-w-52 grow">
                <Select
                  id="nachfolge"
                  value={nachfolge}
                  placeholder={common.choose}
                  options={managers
                    .filter((m) => m.person_id !== speaker.owner_person_id)
                    .map((m) => ({ value: m.person_id, label: m.display_name ?? m.person_id }))}
                  onChange={(e) => setNachfolge(e.target.value)}
                />
              </Field>
              <Button
                size="sm"
                disabled={pending || nachfolge === ""}
                onClick={() =>
                  fuehreAus(() => handoverSpeaker(speaker.id, nachfolge), t.handedOver, () => {
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
          zaehler={nenne(t.stageCounter, { n: String(stufe + 1), m: String(STUFEN.length) })}
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
                {speaker.declined_at ? nenne(t.declinedLine, { date: datum(speaker.declined_at) }) : t.stageEnded}
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

        {/* Blöcke: die Reihenfolge ist fest, nur was offen ist, ändert sich mit dem Stand. */}
        <div className="mt-4">
          <Block id="fenster-grunddaten" ebene="h3" titel={t.blockBasics} kurz={kurzGrunddaten}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t.fieldType} htmlFor="type">
                <Select
                  id="type"
                  value={draft.speaker_type}
                  options={opt(labels.speakerType)}
                  onChange={(e) => setDraft((d) => ({ ...d, speaker_type: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldJobTitle} htmlFor="job">
                <Input
                  id="job"
                  value={draft.job_title}
                  onChange={(e) => setDraft((d) => ({ ...d, job_title: e.target.value }))}
                />
              </Field>
              <Field label={t.fieldOrganization} htmlFor="org">
                <Input
                  id="org"
                  value={draft.organization_name}
                  onChange={(e) => setDraft((d) => ({ ...d, organization_name: e.target.value }))}
                />
              </Field>
            </div>
            {/* LEAD-029: das Foto hochladen oder austauschen, wie im Admin-Detail. */}
            {foto?.editionId && (
              <div className="mt-4">
                <PhotoUpload
                  profileId={speaker.id}
                  editionId={foto.editionId}
                  photoUrl={foto.url}
                  register={registerSpeakerPhotoAsLead}
                  ansicht="betreut"
                  variante="abschnitt"
                  onDone={() => setFotoStand((n) => n + 1)}
                  t={tf}
                  rpcMessages={rpcMessages}
                />
              </div>
            )}
            <div className="mt-4">
              <Field label={t.internalNotes} htmlFor="notes" hint={t.internalNotesHint}>
                <Textarea
                  id="notes"
                  rows={2}
                  value={draft.internal_notes}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
                />
              </Field>
            </div>
          </Block>

          <Block id="fenster-pipeline" ebene="h3" titel={t.blockPipeline} kurz={kurzPipeline} offen={!nachZusage}>
            {/* Zeitstempel aus Migration 0099: sie sagen, wie lange eine Zusage gedauert hat und warum jemand abgesagt hat. */}
            {(speaker.confirmed_at || speaker.declined_at) && (
              <dl className="ct-help mb-4 flex flex-col gap-0.5">
                {speaker.confirmed_at && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">{t.confirmedOn}:</dt>
                    <dd>{datum(speaker.confirmed_at)}</dd>
                  </div>
                )}
                {speaker.declined_at && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">{t.declinedOn}:</dt>
                    <dd>
                      {datum(speaker.declined_at)}
                      {speaker.decline_reason &&
                        ` · ${labels.declineReason[speaker.decline_reason] ?? speaker.decline_reason}`}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
              {/* Verlauf (LEAD-039 Schnitt 2): Notizen, Kontakte, Aufgaben mit Frist — links, weil er in der Akquise am
                  häufigsten gebraucht wird. */}
              <section>
                <h4 className="ct-label mb-1 text-ink">{tv.title}</h4>
                <p className="ct-help mb-3">{tv.hint}</p>
                <Verlauf
                  profileId={speaker.id}
                  meId={meId}
                  zustaendige={managers.map((m) => ({ id: m.person_id, name: m.display_name ?? "—" }))}
                  arten={verlaufArten}
                  dateLocale={dateLocale}
                  t={tv}
                  rpcMessages={rpcMessages}
                />
              </section>
              {/* Einordnung aus der Arbeitstabelle (LEAD-039) */}
              <section>
                <h4 className="ct-label mb-1 text-ink">{te.title}</h4>
                <p className="ct-help mb-3">{te.hint}</p>
                <EinordnungFelder
                  idPrefix={`einordnung-${speaker.id}`}
                  value={einordnung}
                  onChange={setEinordnung}
                  optionen={einordnungOptionen}
                  t={te}
                  none={common.none}
                  disabled={pending}
                />
              </section>
            </div>
          </Block>

          {nachZusage && !gast && (
            <Block
              id="fenster-onboarding"
              ebene="h3"
              titel={t.blockOnboarding}
              marke={markeVon("onboarding")}
              kurz={kurzOnboarding}
              offen={offenVon("onboarding")}
            >
              <InfoList
                schmal
                items={[
                  {
                    key: "invited",
                    label: t.onboardingInvitation,
                    value: speaker.invited_at ? nenne(t.shortInvited, { date: datum(speaker.invited_at) }) : t.shortNotInvited,
                  },
                  { key: "email", label: t.onboardingEmail, value: speaker.email ?? t.contactHidden },
                ]}
              />
              {/* Die Einladung schickt eine Mail an den Speaker — deshalb fragt sie vorher. `invite_speaker` weist Gäste ab
                  (0188) und verlangt die Zusage (`not_confirmed`): für sie steht der Knopf gar nicht erst da. */}
              {!abgesagt && (
                <div className="mt-3">
                  <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEinladungFrage(true)}>
                    {speaker.invited_at ? t.inviteAgain : t.invite}
                  </Button>
                </div>
              )}
              <h4 className="ct-label mb-2 mt-5 text-ink">{t.openSteps}</h4>
              {offeneSchritte.length === 0 ? (
                <Badge tone="success">{t.allDone}</Badge>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {offeneSchritte.map((step) => (
                    <Badge key={step}>{t[`step_${step}`] ?? step}</Badge>
                  ))}
                </div>
              )}
            </Block>
          )}

          {nachZusage && !gast && (
            <Block
              id="fenster-hospitality"
              ebene="h3"
              titel={t.blockHospitality}
              marke={markeVon("hospitality")}
              kurz={kurzHospitality}
              offen={offenVon("hospitality")}
            >
              {/* Team-Felder — für Manager gar nicht erst sichtbar (LEAD-054): ihnen sagt ein Satz, wer sie setzt. */}
              {isTeam ? (
                <>
                  <h4 className="ct-label mb-3 text-ink">{t.teamFields}</h4>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t.fieldPassType} htmlFor="pass">
                      <Select
                        id="pass"
                        value={draft.pass_type}
                        options={opt(labels.passType)}
                        onChange={(e) => setDraft((d) => ({ ...d, pass_type: e.target.value }))}
                      />
                    </Field>
                    <Field label={t.fieldHotelTier} htmlFor="tier">
                      <Select
                        id="tier"
                        value={draft.hotel_tier}
                        options={opt(labels.hotelTier)}
                        onChange={(e) => setDraft((d) => ({ ...d, hotel_tier: e.target.value }))}
                      />
                    </Field>
                    <Field label={t.fieldHospitality} htmlFor="hosp">
                      <Select
                        id="hosp"
                        value={draft.hospitality_status}
                        options={opt(labels.hospitality)}
                        onChange={(e) => setDraft((d) => ({ ...d, hospitality_status: e.target.value }))}
                      />
                    </Field>
                    <Checkbox
                      label={t.fieldLounge}
                      className="self-end"
                      checked={draft.lounge_access}
                      onChange={(e) => setDraft((d) => ({ ...d, lounge_access: e.target.checked }))}
                    />
                  </div>
                </>
              ) : (
                <p className="ct-help">{t.teamFieldsHint}</p>
              )}
              <div className="mt-4 flex flex-col gap-1">
                <Checkbox
                  label={t.receptionEligible}
                  checked={draft.reception_eligible}
                  onChange={(e) => setDraft((d) => ({ ...d, reception_eligible: e.target.checked }))}
                />
                <Checkbox
                  label={t.travelCovered}
                  checked={draft.travel_costs_covered}
                  onChange={(e) => setDraft((d) => ({ ...d, travel_costs_covered: e.target.checked }))}
                />
              </div>
              <h4 className="ct-label mb-1 mt-5 text-ink">{t.travel}</h4>
              <p className="ct-help">
                {speaker.travel_costs_covered ? t.travelCoveredYes : t.travelCoveredNo}
                {" · "}
                {speaker.travel_costs_approved ? t.travelApprovedYes : t.travelApprovedNo}
              </p>
              <p className="ct-help mt-1">{t.travelApproveHint}</p>
              {/* Freigeben darf nur Bereichsleitung oder Admin (`approve_travel_costs` antwortet sonst 42501). Einem
                  Manager den Knopf zu zeigen, den er nicht drücken kann, wäre nur eine Einladung in den Fehler. */}
              {isTeam && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending || speaker.travel_costs_approved}
                    onClick={() => fuehreAus(() => approveTravelCosts(speaker.id, true), t.travelApproved)}
                  >
                    {t.travelApprove}
                  </Button>
                </div>
              )}
            </Block>
          )}

          {nachZusage && (
            <Block
              id="fenster-programm"
              ebene="h3"
              titel={t.blockProgramme}
              marke={markeVon("programm")}
              kurz={kurzProgramm}
              offen={offenVon("programm")}
            >
              {sessions.length === 0 ? (
                <p className="ct-help">{t.noSessionHint}</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {sessions.map((s) => (
                    <li key={s.session_id} className="ct-help">
                      {(locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? "—"}
                      {s.stage_name && ` · ${s.stage_name}`}
                      {s.start_at && ` · ${datum(s.start_at)}`}
                      {s.publish_status && ` · ${labels.publishStatus?.[s.publish_status] ?? s.publish_status}`}
                    </li>
                  ))}
                </ul>
              )}
              {isTeam && aktion !== "session" && (
                <div className="mt-3">
                  <ButtonLink href={BOARD_PFAD} variant="secondary" size="sm">
                    {t.actionSession}
                  </ButtonLink>
                </div>
              )}
            </Block>
          )}
        </div>

        {/* Die Leiste klebt am unteren Rand des Fensters: es ist lang, und „Speichern“ soll nicht erst nach dem Scrollen zu
            finden sein. Die Meldung des Fensters (`error`) zeigt `ModalFuss` selbst, über den Knöpfen. */}
        <ModalFuss>
          {/* Mit einer Adresse in „Kontakt via“ wird nicht gespeichert — das Feld sagt, warum (kein Toast für einen
              Formularfehler). Zweitrangig: die eine primäre Aktion des Fensters ist die Hauptaktion oben. */}
          <Button variant="secondary" onClick={onSave} loading={pending} disabled={adresse}>
            {t.saveChanges}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={schliessen}>
            {common.close}
          </Button>
        </ModalFuss>
      </Modal>

      {einladungFrage && (
        <ConfirmDialog
          title={t.inviteConfirmTitle}
          body={speaker.email ? nenne(t.inviteConfirmBody, { email: speaker.email }) : t.inviteConfirmBodyNoMail}
          confirmLabel={t.invite}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => {
            setEinladungFrage(false);
            fuehreAus(() => inviteSpeaker(speaker.id), t.invited);
          }}
          onCancel={() => setEinladungFrage(false)}
        />
      )}
      {verwerfenFrage && (
        <ConfirmDialog
          title={t.discardTitle}
          body={t.discardBody}
          confirmLabel={t.discardConfirm}
          cancelLabel={t.keepEditing}
          onConfirm={() => {
            setVerwerfenFrage(false);
            onClose();
          }}
          onCancel={() => setVerwerfenFrage(false)}
        />
      )}
    </>
  );
}
