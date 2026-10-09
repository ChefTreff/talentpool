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
import { ConfirmDialog, Modal, ModalFuss } from "@/components/ui/Modal";
import { PortraitShape } from "@/components/ui/PortraitShape";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { EinordnungFelder, type EinordnungOptionen } from "@/components/speaker/Einordnung";
import { Verlauf } from "@/components/speaker/Verlauf";
import { PhotoUpload } from "@/components/speaker/PhotoUpload";
import { SpeakerKopf, type KopfErgebnis } from "@/components/speaker/SpeakerKopf";
import { SideEventsBlock } from "@/components/speaker/SideEventsBlock";
import { sideEventsKurz, sideEventsMarke, type SpeakerSideEvent } from "@/lib/speaker/side-events";
import {
  buehnenGeaendert,
  einordnungAenderungen,
  einordnungEntwurf,
  kontaktViaHatAdresse,
} from "@/lib/speaker/einordnung";
import {
  approveTravelCosts,
  handoverSpeaker,
  inviteSpeaker,
  registerSpeakerPhotoAsLead,
  setPipeline,
  speakerFoto,
  speakerSideEvents,
  setStageCandidates,
  updateSpeaker,
} from "./actions";
import type { ManagedSpeaker, ManagerOption } from "./types";
import { aufraeumen, blockMarken, hauptaktion, naechstePflichten, warNachZusage, type PflichtBlock } from "./phase";
import { entwurfGeaendert, fensterEntwurf } from "./entwurf";

type Strings = Record<string, string>;

/** Das Programmboard der Leads — dorthin führt „Im Programmboard zuordnen“. */
const BOARD_PFAD = "/speaker-leads/board";

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

  /** Rückfragen: eine Mail an den Speaker und das Verwerfen von Änderungen (das Aktionspanel steht im Kopf). */
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

  // ADM-087: die Side-Event-Einladungen — nur das Team liest sie (`speaker_side_events` antwortet Stage Leads mit 42501, darum fragt das
  // Fenster sie dort gar nicht erst), nur nach der Zusage und nie für Gäste von Partnern (sie werden nicht eingeladen). `undefined` heißt
  // „lädt“, `null` „nicht zu lesen“.
  const zeigeSideEvents = isTeam && nachZusage && !gast;
  const [sideEvents, setSideEvents] = useState<SpeakerSideEvent[] | null | undefined>(undefined);
  useEffect(() => {
    if (!zeigeSideEvents) return;
    let aktuell = true;
    void speakerSideEvents(speaker.id).then((rows) => {
      if (aktuell) setSideEvents(rows);
    });
    return () => {
      aktuell = false;
    };
  }, [speaker.id, zeigeSideEvents]);

  function report(res: KopfErgebnis, okText: string): boolean {
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
  function fuehreAus(aktionFn: () => Promise<KopfErgebnis>, okText: string, danach?: () => void) {
    startTransition(async () => {
      if (report(await aktionFn(), okText)) danach?.();
    });
  }

  function onSave() {
    startTransition(async () => {
      // Team-Felder nur mitschicken, wenn sie erlaubt sind — sonst antwortet
      // die RPC mit `team_only_fields` und nichts wird gespeichert.
      const data: Record<string, unknown> = {
        speaker_type: draft.speaker_type,
        job_title: draft.job_title,
        organization_name: draft.organization_name,
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

  // --- Kopf ---------------------------------------------------------------------------------------------------------------
  const untertitel = [speaker.job_title, speaker.organization_name].filter(Boolean).join(" · ");
  const kategorie = speaker.category ? (einordnungOptionen.category[speaker.category] ?? speaker.category) : null;
  // „Prio“ ist die interne Einstufung der Programmleitung: im Kopf nur für das Team (LEAD-053 zieht dieselbe Grenze durch das Fenster).
  const prio = isTeam && speaker.priority ? (einordnungOptionen.priority[speaker.priority] ?? speaker.priority) : null;
  // Die Hotel-Kategorie nur, wenn sie von der Vorgabe abweicht — und nur der Teil vor der Klammer („Premium (Grand Elysée)“).
  const hotelAbweichend = speaker.hotel_tier !== "standard";
  const hotelKurz = (labels.hotelTier[speaker.hotel_tier] ?? speaker.hotel_tier).split(" (")[0];

  const darfWeitergeben = (isTeam || speaker.owner_person_id === meId) && managers.length > 0;

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
  // Side Events: „Offen · n“ bei unbeantworteten Einladungen zu veröffentlichten Events; solange sie laden, steht keine Zeile da.
  const markeSideEvents = sideEvents ? sideEventsMarke(sideEvents, t) : undefined;
  const kurzSideEvents = sideEvents === undefined ? undefined : sideEvents === null ? t.sideEventsError : sideEventsKurz(sideEvents, t);

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

        {/* … die eine Hauptaktion, die weiteren, wo er steht und was als Nächstes zu tun ist: der Kopf, den auch das
            Admin-Detail benutzt (`components/speaker/SpeakerKopf.tsx`). */}
        <SpeakerKopf
          speaker={speaker}
          name={name}
          team={isTeam}
          ownerOptionen={managers
            .filter((m) => m.person_id !== speaker.owner_person_id)
            .map((m) => ({ value: m.person_id, label: m.display_name ?? m.person_id }))}
          darfWeitergeben={darfWeitergeben}
          pending={pending}
          onRun={fuehreAus}
          onEinladen={() => setEinladungFrage(true)}
          aktionen={{
            setPipeline: (status, grund) => setPipeline(speaker.id, status, grund),
            handover: (personId) => handoverSpeaker(speaker.id, personId ?? ""),
            approveTravel: () => approveTravelCosts(speaker.id, true),
          }}
          blockPrefix="fenster-"
          boardPfad={BOARD_PFAD}
          labels={{ pipeline: labels.pipeline, declineReason: labels.declineReason }}
          t={t}
          tv={tv}
          common={common}
          dateLocale={dateLocale}
        />

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

          {/* Side Events (ADM-087): nur das Team, nur nach der Zusage, nie für Gäste — nur lesend, eingeladen wird unter /admin/side-events. */}
          {zeigeSideEvents && (
            <Block id="fenster-side-events" ebene="h3" titel={t.blockSideEvents} marke={markeSideEvents} kurz={kurzSideEvents}>
              <SideEventsBlock
                rows={sideEvents}
                gast={gast}
                statusLabels={labels.sideEventStatus ?? {}}
                sprache={dateLocale}
                locale={locale}
                t={t}
              />
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
