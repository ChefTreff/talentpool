"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Block } from "@/components/ui/Block";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field } from "@/components/ui/Field";
import { InfoList } from "@/components/ui/InfoList";
import { Input, Textarea } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  approveTravelCosts,
  handoverSpeaker,
  inviteSpeaker,
  registerSpeakerPhotoAsAdmin,
  removeSpeakerContact,
  saveSpeaker,
  saveSpeakerContact,
  setContacts,
  setExpenseMode,
  setMailVia,
  setPipeline,
  setStageCandidates,
  type AdminResult,
} from "../actions";
import { KontakteCard } from "@/components/speaker/KontakteCard";
import { SpeakerKopf, type KopfErgebnis } from "@/components/speaker/SpeakerKopf";
import { aufraeumen, blockMarken, naechstePflichten, warNachZusage, type PflichtBlock } from "@/app/(speaker-leads)/speaker-leads/phase";
import { EinordnungFelder, type EinordnungOptionen } from "@/components/speaker/Einordnung";
import { Verlauf } from "@/components/speaker/Verlauf";
import { PhotoUpload } from "@/components/speaker/PhotoUpload";
import {
  buehnenGeaendert,
  einordnungAenderungen,
  einordnungEntwurf,
  kontaktViaHatAdresse,
} from "@/lib/speaker/einordnung";
import type { VerlaufStand } from "@/lib/speaker/verlauf";
import { RIDER_FLAGS, SOCIAL_KEYS, type ContactOption, type SpeakerConsentRow, type SpeakerDetail, type SpeakerManager } from "../types";

type Strings = Record<string, string>;

/**
 * Das Detailblatt eines Speakers — **Archetyp B · Detail** (`referenzen/muster.md`), seit LEAD-055 (Teil 2) mit demselben
 * Kopf und denselben Blöcken wie das Personen-Fenster der Leads, nur als Karten: wer das Fenster kennt, kennt die Seite.
 *
 * - **Kopf:** Badges, **eine Hauptaktion**, „Weitere Aktionen“ (Betreuung, Stand ändern, Einladung erneut, Absage), die
 *   Stufenleiste und die Zeile „Betreut von · Als Nächstes · E-Mail“ — der Baustein `SpeakerKopf`, den auch das Fenster nimmt.
 *   Was sofort wirkt und protokolliert wird (Stand, Betreuung, Einladung, Kostenfreigabe), steht dort und braucht kein
 *   „Speichern“; vorher saß es in einem Handlungsband zwischen zwei Spalten.
 * - **Sechs Blöcke in fester Reihenfolge**, eine Spalte: Grunddaten, Pipeline, Onboarding, Profil, Hospitality, Programm. Der Admin
 *   sieht in jedem Stand alle (LEAD-054: „Admin sieht weiter alles“); die Marken („Nächste Pflicht“, „Offen · 2“, „Erledigt“, nach
 *   einer Absage nach der Zusage „Aufräumen“) lesen wie im Fenster aus `naechstePflichten()` und sagen, wo man hinschauen soll.
 *   Der Block **Profil** (Biografien, Links, Technik) gibt es nur hier: das pflegt der Speaker selbst.
 * - Die Felder der Blöcke teilen sich **einen** Entwurf und **einen** Speichern-Balken, der unten klebt und **nur bei Änderungen**
 *   erscheint; was aus anderen Quellen kommt (Reise, Sessions, Zeitstempel, Einwilligungen), steht lesend im jeweiligen Block.
 *   Ein dauerhaft sichtbarer Knopf ohne Aufgabe ist eine Einladung zum Leerklicken.
 * - **Admin-Vollständigkeit:** die Seite ist die Obermenge des Fensters — kein Feld des Fensters fehlt hier.
 */
export function SpeakerDetailView({
  speaker,
  consents,
  fotoUrl,
  tf,
  managers,
  contacts,
  labels,
  einordnungOptionen,
  meId,
  verlaufArten,
  verlaufStand,
  dateLocale,
  word,
  t,
  tl,
  te,
  tv,
  tg,
  common,
  rpcMessages,
}: {
  speaker: SpeakerDetail;
  /** SPK-074: Stand je Einwilligung, mit Namen bei stellvertretender Bestätigung. */
  consents: SpeakerConsentRow[];
  /** LEAD-029: signierte Adresse des aktuellen Fotos, `null` ohne Foto. */
  fotoUrl: string | null;
  /** Foto-Texte, Auszug aus `speaker`. */
  tf: Strings;
  managers: SpeakerManager[];
  contacts: ContactOption[];
  labels: Record<string, Record<string, string>>;
  /** Auswahllisten der Einordnung (LEAD-039): Vokabular und Bühnen der Edition. */
  einordnungOptionen: EinordnungOptionen;
  /** Die eigene Person — Standard-Zuständige neuer Aufgaben im Verlauf. */
  meId: string;
  /** Bezeichnungen aus `speaker_activity_kind` (Verlauf, LEAD-039 Schnitt 2). */
  verlaufArten: Record<string, string>;
  /** Nächste Aufgabe und letzte Aktivität aus dem Verlauf — `speaker_detail()` liefert sie nicht, die Seite liest sie dazu. */
  verlaufStand: VerlaufStand;
  dateLocale: string;
  /** Das kursive Wort des Abschnitts im Seitenkopf (QS-037). */
  word: string;
  t: Strings;
  /** `leads`-Texte — dieselben wie im Fenster: Kopf, Blocktitel, Marken, Kurzfassungen. */
  tl: Strings;
  /** `speakerEinordnung`-Texte — dieselben wie im Fenster der Speaker-Leads. */
  te: Strings;
  /** `speakerVerlauf`-Texte. */
  tv: Strings;
  /** `speakerGast`-Texte (SPK-070). */
  tg: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [draft, setDraft] = useState(() => draftVon(speaker));
  const [lead, setLead] = useState(speaker.lead_contact_id ?? "");
  const [buddy, setBuddy] = useState(speaker.buddy_contact_id ?? "");
  // SPK-072: an wen die Speaker-Mails gehen ("" = den Speaker selbst).
  const [mailVia, setMailViaWahl] = useState(speaker.mail_via?.contact_id ?? "");
  /** Die Einladung ist eine Mail an den Speaker: sie fragt vorher und nennt die Adresse. */
  const [einladungFrage, setEinladungFrage] = useState(false);
  const mitZugang = (speaker.speaker_contacts ?? []).filter((k) => k.has_access);
  // Einordnung (LEAD-039): Ausgangsstand aus dem geladenen Speaker — nach
  // `router.refresh()` kommt ein neuer herein, und der Balken verschwindet.
  const einordnungVorher = useMemo(() => einordnungEntwurf(speaker), [speaker]);
  const [einordnung, setEinordnung] = useState(einordnungVorher);
  const adresse = kontaktViaHatAdresse(einordnung.contact_via);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const zeitpunkt = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" });
  const name =
    [speaker.person.title, speaker.person.first_name, speaker.person.last_name]
      .filter(Boolean)
      .join(" ") || common.none;

  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function report(res: AdminResult | KopfErgebnis, okText: string): boolean {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return true;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
    return false;
  }

  /** Eine Aktion des Kopfes oder eines Blocks: Toast und Aktualisieren bei Erfolg, der Fehler als Toast sonst. */
  function fuehreAus(aktion: () => Promise<AdminResult | KopfErgebnis>, okText: string, danach?: () => void) {
    startTransition(async () => {
      if (report(await aktion(), okText)) danach?.();
    });
  }

  function onSave() {
    startTransition(async () => {
      const data: Record<string, unknown> = {
        speaker_type: draft.speaker_type,
        job_title: draft.job_title,
        organization_name: draft.organization_name,
        bio_short_de: draft.bio_short_de,
        bio_short_en: draft.bio_short_en,
        bio_long_de: draft.bio_long_de,
        bio_long_en: draft.bio_long_en,
        pass_type: draft.pass_type,
        hotel_tier: draft.hotel_tier,
        hospitality_status: draft.hospitality_status,
        lounge_access: draft.lounge_access,
        reception_eligible: draft.reception_eligible,
        travel_costs_covered: draft.travel_costs_covered,
        socials: Object.fromEntries(
          SOCIAL_KEYS.map((k) => [k, draft[k].trim()]).filter(([, v]) => v !== ""),
        ),
        tech_rider: {
          mic: draft.mic.trim() || null,
          own_laptop: draft.own_laptop,
          video: draft.video,
          notes: draft.notes.trim() || null,
        },
      };
      // Die Notiz wandert nur mit, wenn sie sichtbar **und** geändert ist.
      // Wer sie nicht sehen darf, soll sie auch nicht versehentlich leeren.
      if (speaker.internal_notes_visible && draft.internal_notes !== (speaker.internal_notes ?? "")) {
        data.internal_notes = draft.internal_notes;
      }
      // Einordnung: nur, was sich geändert hat (ein stillgelegter Begriff wird
      // so nicht erneut geprüft).
      Object.assign(data, einordnungAenderungen(einordnungVorher, einordnung));
      const res = await saveSpeaker(speaker.id, data);
      if (!res.ok || !buehnenGeaendert(einordnungVorher, einordnung)) {
        report(res, t.saved);
        return;
      }
      report(await setStageCandidates(speaker.id, einordnung.stage_ids), t.saved);
    });
  }

  const opt = (map: Record<string, string>) =>
    Object.entries(map).map(([value, label]) => ({ value, label }));

  // Der Speichern-Balken erscheint nur, wenn es etwas zu speichern gibt.
  // Verglichen wird gegen denselben Ausgangszustand, aus dem `draft` gebaut
  // wurde — nach `router.refresh()` kommt ein neuer `speaker` herein und der
  // Balken verschwindet von allein.
  const rider0 = (speaker.tech_rider ?? {}) as Record<string, unknown>;
  const socials0 = speaker.socials ?? {};
  const unveraendert =
    draft.speaker_type === speaker.speaker_type &&
    draft.job_title === (speaker.job_title ?? "") &&
    draft.organization_name === (speaker.organization_name ?? "") &&
    draft.bio_short_de === (speaker.bio_short_de ?? "") &&
    draft.bio_short_en === (speaker.bio_short_en ?? "") &&
    draft.bio_long_de === (speaker.bio_long_de ?? "") &&
    draft.bio_long_en === (speaker.bio_long_en ?? "") &&
    draft.pass_type === speaker.pass_type &&
    draft.hotel_tier === speaker.hotel_tier &&
    draft.hospitality_status === speaker.hospitality_status &&
    draft.lounge_access === speaker.lounge_access &&
    draft.reception_eligible === speaker.reception_eligible &&
    draft.travel_costs_covered === speaker.travel_costs_covered &&
    draft.internal_notes === (speaker.internal_notes ?? "") &&
    draft.mic === (typeof rider0.mic === "string" ? rider0.mic : "") &&
    draft.notes === (typeof rider0.notes === "string" ? rider0.notes : "") &&
    draft.own_laptop === (rider0.own_laptop === true) &&
    draft.video === (rider0.video === true) &&
    SOCIAL_KEYS.every((k) => draft[k] === (socials0[k] ?? "")) &&
    Object.keys(einordnungAenderungen(einordnungVorher, einordnung)).length === 0 &&
    !buehnenGeaendert(einordnungVorher, einordnung);

  // --- Kopf ---------------------------------------------------------------------------------------------------------------
  // Dieselben Felder wie im Fenster der Leads — `speaker_detail()` nennt sie nur anders.
  const kopfSpeaker = {
    pipeline_status: speaker.pipeline_status,
    confirmed_at: speaker.confirmed_at,
    declined_at: speaker.declined_at,
    decline_reason: speaker.decline_reason,
    owner_person_id: speaker.owner_person_id,
    owner_name: speaker.owner_name,
    email: speaker.person.email,
    invited_at: speaker.invited_at,
    hospitality_status: speaker.hospitality_status,
    travel_costs_covered: speaker.travel_costs_covered,
    travel_costs_approved: speaker.travel_costs_approved_at !== null,
    sessions: speaker.sessions,
    stage_guest: Boolean(speaker.stage_guest),
    next_task: verlaufStand.next_task,
    mail_via: speaker.mail_via,
  };
  const nachZusage = warNachZusage(kopfSpeaker);
  const abgesagt = speaker.pipeline_status === "declined";
  const gast = Boolean(speaker.stage_guest);
  const pflichten = naechstePflichten(kopfSpeaker);
  const marken = blockMarken(pflichten);
  const haengt = aufraeumen({
    hospitality_status: speaker.hospitality_status,
    travel_costs_approved: speaker.travel_costs_approved_at !== null,
    sessions: speaker.sessions,
  });
  const kategorie = speaker.category ? (einordnungOptionen.category[speaker.category] ?? speaker.category) : null;
  // Das Admin-Detail ist das Team: die interne Einstufung (A/B/C) steht hier im Kopf, im Fenster der Stage Leads nicht.
  const prio = speaker.priority ? (einordnungOptionen.priority[speaker.priority] ?? speaker.priority) : null;
  const hotelAbweichend = speaker.hotel_tier !== "standard";
  const hotelKurz = (labels.hotelTier[speaker.hotel_tier] ?? speaker.hotel_tier).split(" (")[0];

  // --- Blöcke -------------------------------------------------------------------------------------------------------------
  /** Marke eines Pflicht-Blocks: aus den offenen Pflichten, nach einer Absage „Aufräumen“, für Gäste keine. */
  const markeVon = (b: PflichtBlock): { text: string; ton: BadgeTone } | undefined => {
    if (gast) return undefined;
    if (abgesagt) return haengt[b] ? { text: tl.markCleanup, ton: "warning" } : undefined;
    const m = marken[b];
    if (m.zustand === "erledigt") return { text: tl.markDone, ton: "success" };
    if (m.zustand === "naechste") return { text: tl.markNext, ton: "accent" };
    return { text: m.n > 1 ? tl.markOpenN.replace("{n}", String(m.n)) : tl.markOpen, ton: "warning" };
  };
  const offenVon = (b: PflichtBlock) => !gast && !abgesagt && marken[b].zustand === "naechste";

  const nenne = (vorlage: string, werte: Record<string, string>) =>
    Object.entries(werte).reduce((text, [k, v]) => text.replace(`{${k}}`, v), vorlage);
  const teile = (...teile: (string | false | null | undefined)[]) => teile.filter(Boolean).join(" · ") || undefined;

  const offeneAufgaben = verlaufStand.open_tasks ?? 0;
  const bioFehlt = [!speaker.bio_short_de && "DE", !speaker.bio_short_en && "EN"].filter(Boolean) as string[];
  const anzahlLinks = SOCIAL_KEYS.filter((k) => (socials0[k] ?? "") !== "").length;
  const sessions = speaker.sessions;

  const kurzGrunddaten = teile(
    fotoUrl === null && tl.shortNoPhoto,
    speaker.internal_notes_visible && !speaker.internal_notes && tl.shortNoNote,
  );
  const kurzPipeline = nachZusage
    ? teile(
        speaker.confirmed_at && nenne(tl.shortConfirmedOn, { date: datum.format(new Date(speaker.confirmed_at)) }),
        kategorie && nenne(tl.shortCategory, { c: kategorie }),
        prio,
      )
    : teile(
        verlaufStand.last_activity_at
          ? nenne(tl.shortActivity, { date: datum.format(new Date(verlaufStand.last_activity_at)) })
          : tl.shortNoActivity,
        offeneAufgaben > 0 && (offeneAufgaben === 1 ? tl.shortOneTask : nenne(tl.shortTasks, { n: String(offeneAufgaben) })),
      );
  const kurzOnboarding = teile(
    speaker.mail_via
      ? t.shortManaged
      : speaker.invited_at
        ? nenne(tl.shortInvited, { date: datum.format(new Date(speaker.invited_at)) })
        : tl.shortNotInvited,
    speaker.person.has_account ? t.hasAccount : t.noAccount,
  );
  const kurzProfil = teile(
    bioFehlt.length === 0 ? t.shortBioDone : bioFehlt.length === 2 ? t.shortBioNone : nenne(t.shortBioMissing, { lang: bioFehlt[0] }),
    anzahlLinks > 0 && (anzahlLinks === 1 ? t.shortOneLink : nenne(t.shortLinks, { n: String(anzahlLinks) })),
  );
  const kurzHospitality = teile(
    `${tl.fieldHospitality}: ${labels.hospitality[speaker.hospitality_status] ?? speaker.hospitality_status}`,
    `${tl.travel}: ${speaker.travel_costs_covered ? tl.travelCoveredYes : tl.travelCoveredNo}`,
  );
  const kurzProgramm =
    sessions.length === 0 ? tl.shortNoSession : sessions.length === 1 ? tl.shortOneSession : nenne(tl.shortSessions, { n: String(sessions.length) });

  return (
    <>
      <PageHeader
        word={word}
        title={name}
        description={[speaker.job_title, speaker.organization_name].filter(Boolean).join(" · ")}
        eyebrow={
          <Link href="/admin/speaker" className="ct-link">
            {t.backToList}
          </Link>
        }
      />

      {/* Die Seite ist die laengste der Anwendung (QS-026) — jetzt sechs Blöcke statt zehn Karten. Die Abschnitte stehen hier
          einmal; dieselbe Liste spiegelt die Seitenleiste. */}
      <AbschnittsNavigation
        label={t.sectionsLabel}
        items={[
          { id: "grunddaten", label: tl.blockBasics },
          { id: "pipeline", label: tl.blockPipeline },
          { id: "onboarding", label: tl.blockOnboarding },
          { id: "profil", label: t.blockProfile },
          { id: "hospitality", label: tl.blockHospitality },
          { id: "programm", label: tl.blockProgramme },
        ]}
      />

      <div className="flex flex-col gap-4">
        {/* --- Kopf: Badges, die eine Hauptaktion, Weitere Aktionen, Stufenleiste, Kontext --------------------------------- */}
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{labels.speakerType[speaker.speaker_type] ?? speaker.speaker_type}</Badge>
            {kategorie && <Badge>{kategorie}</Badge>}
            {prio && <Badge>{prio}</Badge>}
            {hotelAbweichend && <Badge tone="accent">{nenne(tl.hotelBadge, { tier: hotelKurz })}</Badge>}
            {gast && <Badge>{tg.badge}</Badge>}
            {speaker.assistant_name && (
              <Badge tone="accent">
                {tl.assistant}: {speaker.assistant_name}
              </Badge>
            )}
            {speaker.person.has_account ? (
              <Badge tone="success">{t.hasAccount}</Badge>
            ) : (
              <Badge tone="warning">{t.noAccount}</Badge>
            )}
          </div>
          {gast && <p className="ct-help mt-2 text-muted">{tg.hint}</p>}
          {/* PART-091: der Partner verwaltet alles — die Mails gehen an seinen Kontakt. */}
          {speaker.mail_via && (
            <p className="ct-help mt-2 text-muted">
              {(speaker.mail_via.has_access ? t.mailVia : t.mailViaNoAccess).replace("{name}", speaker.mail_via.name ?? "—")}
            </p>
          )}
          <SpeakerKopf
            speaker={kopfSpeaker}
            name={name}
            team
            ownerOptionen={managers.map((m) => ({ value: m.person_id, label: m.display_name ?? m.email ?? m.person_id }))}
            darfWeitergeben
            ohneBetreuung
            pending={pending}
            onRun={fuehreAus}
            onEinladen={() => setEinladungFrage(true)}
            aktionen={{
              setPipeline: (status, grund) => setPipeline(speaker.id, status, grund ?? null),
              handover: (personId) => handoverSpeaker(speaker.id, personId),
              approveTravel: () => approveTravelCosts(speaker.id, true),
            }}
            blockPrefix=""
            boardPfad="/admin/programm"
            labels={{ pipeline: labels.pipeline, declineReason: labels.declineReason }}
            t={tl}
            tv={tv}
            common={common}
            dateLocale={dateLocale}
          />
        </Card>

        {/* --- Die Blöcke: Reihenfolge fest, nur was offen ist, ändert sich mit dem Stand ----------------------------------- */}
        <Block id="grunddaten" karte ebene="h2" titel={tl.blockBasics} kurz={kurzGrunddaten}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.speakerType} htmlFor="typ">
              <Select
                id="typ"
                value={draft.speaker_type}
                onChange={(e) => set("speaker_type", e.target.value)}
                options={opt(labels.speakerType)}
              />
            </Field>
            <Field label={t.jobTitle} htmlFor="job">
              <Input id="job" value={draft.job_title} onChange={(e) => set("job_title", e.target.value)} />
            </Field>
            <Field label={t.organization} htmlFor="org" hint={speaker.org_name ? `${t.linkedOrg}: ${speaker.org_name}` : undefined}>
              <Input
                id="org"
                value={draft.organization_name}
                onChange={(e) => set("organization_name", e.target.value)}
              />
            </Field>
            <Field label={t.email}>
              <p className="ct-small py-2">{speaker.person.email ?? common.none}</p>
            </Field>
            <Field label={t.salutation} hint={t.salutationHint}>
              <p className="ct-small py-2">
                {speaker.person.salutation_de ?? common.none}
                {" · "}
                <Link href={`/admin/personen/${speaker.person.id}`} className="ct-link">
                  {t.toPerson}
                </Link>
              </p>
            </Field>
            <Field label={t.language}>
              <p className="ct-small py-2">{speaker.person.preferred_language ?? common.none}</p>
            </Field>
          </div>

          {/* LEAD-029: das Foto wirkt sofort, ohne Speichern. */}
          <div className="mt-5">
            <PhotoUpload
              profileId={speaker.id}
              editionId={speaker.edition_id}
              photoUrl={fotoUrl}
              register={registerSpeakerPhotoAsAdmin}
              ansicht="betreut"
              variante="abschnitt"
              t={tf}
              rpcMessages={rpcMessages}
            />
          </div>

          <div className="mt-5">
            {speaker.internal_notes_visible ? (
              <Field label={t.notesTitle} htmlFor="notiz" hint={t.notesHint}>
                <Textarea
                  id="notiz"
                  rows={4}
                  value={draft.internal_notes}
                  onChange={(e) => set("internal_notes", e.target.value)}
                />
              </Field>
            ) : (
              <>
                <h3 className="ct-label text-ink">{t.notesTitle}</h3>
                <p className="ct-small mt-1 text-muted">{t.notesHidden}</p>
              </>
            )}
          </div>
        </Block>

        <Block id="pipeline" karte ebene="h2" titel={tl.blockPipeline} kurz={kurzPipeline} offen={!nachZusage}>
          {/* Zeitstempel: Zusage- und Absagedatum setzt die Datenbank selbst — beim ersten Wechsel, nicht bei jedem Klick. */}
          {(speaker.confirmed_at || speaker.declined_at) && (
            <div className="mb-4">
              <dl className="ct-help flex flex-col gap-0.5">
                {speaker.confirmed_at && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">{t.confirmedOn}:</dt>
                    <dd>{datum.format(new Date(speaker.confirmed_at))}</dd>
                  </div>
                )}
                {speaker.declined_at && (
                  <div className="flex gap-1">
                    <dt className="font-semibold">{t.declinedOn}:</dt>
                    <dd>
                      {datum.format(new Date(speaker.declined_at))}
                      {speaker.decline_reason
                        ? ` · ${labels.declineReason[speaker.decline_reason] ?? speaker.decline_reason}`
                        : ""}
                    </dd>
                  </div>
                )}
              </dl>
              <p className="ct-help mt-1 text-muted">{t.pipelineHint}</p>
            </div>
          )}
          <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
            {/* Verlauf (LEAD-039 Schnitt 2): speichert je Eintrag sofort und steht deshalb nicht im gemeinsamen
                Speichern-Balken. Der Anker `#verlauf` führt die Übersicht aller Verläufe hierher — der Browser klappt den
                Block dabei von selbst auf. */}
            <section id="verlauf" className="scroll-mt-20">
              <h3 className="ct-label mb-1 text-ink">{tv.title}</h3>
              <p className="ct-help mb-3">{tv.hint}</p>
              <Verlauf
                profileId={speaker.id}
                meId={meId}
                zustaendige={managers.map((m) => ({ id: m.person_id, name: m.display_name ?? m.email ?? "—" }))}
                arten={verlaufArten}
                dateLocale={dateLocale}
                t={tv}
                rpcMessages={rpcMessages}
              />
            </section>
            {/* Einordnung aus der Arbeitstabelle (LEAD-039) — dieselben Felder wie im Fenster der Speaker-Leads, im
                gemeinsamen Speichern-Balken. */}
            <section id="einordnung" className="scroll-mt-20">
              <h3 className="ct-label mb-1 text-ink">{te.title}</h3>
              <p className="ct-help mb-3">{te.hint}</p>
              <EinordnungFelder
                idPrefix="einordnung"
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

        <Block
          id="onboarding"
          karte
          ebene="h2"
          titel={tl.blockOnboarding}
          marke={markeVon("onboarding")}
          kurz={kurzOnboarding}
          offen={offenVon("onboarding")}
        >
          <InfoList
            schmal
            items={[
              {
                key: "invited",
                label: tl.onboardingInvitation,
                value: speaker.mail_via
                  ? t.shortManaged
                  : speaker.invited_at
                    ? `${t.invitedOn} ${zeitpunkt.format(new Date(speaker.invited_at))}`
                    : tl.shortNotInvited,
              },
              { key: "access", label: t.portalAccess, value: speaker.person.has_account ? t.accessYes : t.accessNo },
              { key: "email", label: tl.onboardingEmail, value: speaker.person.email ?? common.none },
            ]}
          />
          {/* SPK-070: `invite_speaker` weist Gäste ab (0188) — kein Knopf dafür.
              PART-091: ebenso, wenn der Partner alles verwaltet. */}
          {!speaker.stage_guest && !speaker.mail_via && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => setEinladungFrage(true)}>
                {speaker.invited_at ? tl.inviteAgain : tl.invite}
              </Button>
            </div>
          )}

          {/* SPK-074 (K-40): Einwilligungen der Speakerin, nur lesend. Geben kann sie das Team nicht — nur die Speakerin selbst
              oder, im Verwaltet-Fall, der Kontakt mit Zugang stellvertretend. */}
          <Einwilligungen rows={consents} datum={datum} t={t} />

          <section className="mt-6 border-t pt-5">
            <h3 className="ct-label text-ink">{t.careTitle}</h3>
            <p className="ct-help mb-3">{t.careHint}</p>
            <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Field label={t.contactLead} htmlFor="lead">
                <Select
                  id="lead"
                  value={lead}
                  placeholder={t.contactDefault}
                  onChange={(e) => setLead(e.target.value)}
                  options={contacts
                    .filter((c) => c.type === "speaker_lead")
                    .map((c) => ({ value: c.id, label: c.display_name }))}
                />
              </Field>
              <Field label={t.contactBuddy} htmlFor="buddy">
                <Select
                  id="buddy"
                  value={buddy}
                  placeholder={t.contactDefault}
                  onChange={(e) => setBuddy(e.target.value)}
                  options={contacts
                    .filter((c) => c.type === "speaker_buddy")
                    .map((c) => ({ value: c.id, label: c.display_name }))}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={
                  pending ||
                  (lead === (speaker.lead_contact_id ?? "") && buddy === (speaker.buddy_contact_id ?? ""))
                }
                onClick={() => fuehreAus(() => setContacts(speaker.id, lead || null, buddy || null), t.contactsSaved)}
              >
                {t.setContacts}
              </Button>
            </div>

            {/* Assistenz, Agentur und Office in einer Liste (SPK-040, 0148). Dieselbe Karte wie im Speaker-Portal —
                „Admin-Vollständigkeit": was das Team dort sieht, kann es hier auch pflegen. */}
            <div className="mt-5 border-t pt-4">
              <KontakteCard
                kontakte={speaker.speaker_contacts ?? []}
                readOnly={false}
                profileId={speaker.id}
                aktionen={{ save: saveSpeakerContact, remove: removeSpeakerContact }}
                t={t}
                common={common}
                message={message}
              />
            </div>

            {/* SPK-072 (PART-091): über wen die Speaker-Mails gehen. Zur Wahl stehen nur Kontakte mit Zugang — ohne ihn
                liefe die Weiche ohnehin auf den Speaker zurück. Aufheben geht jederzeit. */}
            {(mitZugang.length > 0 || speaker.mail_via) && (
              <div className="mt-5 flex flex-wrap items-end gap-3 border-t pt-4">
                <Field label={t.mailViaLabel} htmlFor="mail-via" hint={t.mailViaHint} className="min-w-64">
                  <Select
                    id="mail-via"
                    value={mailVia}
                    disabled={pending}
                    onChange={(e) => setMailViaWahl(e.target.value)}
                    options={[
                      { value: "", label: t.mailViaSelf },
                      ...mitZugang.map((k) => ({
                        value: k.id,
                        label: [k.first_name, k.last_name].filter(Boolean).join(" ") || k.email || k.kind,
                      })),
                      // Eingetragen, aber ohne Zugang: steht gekennzeichnet da, damit
                      // sich die Umleitung aufheben lässt — sonst zeigte die Liste
                      // „den Speaker selbst“, und eine Auswahl änderte nichts.
                      ...(speaker.mail_via && !speaker.mail_via.has_access
                        ? [{
                            value: speaker.mail_via.contact_id,
                            label: t.mailViaNoAccessOption.replace("{name}", speaker.mail_via.name ?? "—"),
                          }]
                        : []),
                    ]}
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={pending || mailVia === (speaker.mail_via?.contact_id ?? "")}
                  onClick={() => fuehreAus(() => setMailVia(speaker.id, mailVia || null), t.mailViaSaved)}
                >
                  {t.mailViaApply}
                </Button>
              </div>
            )}
          </section>
        </Block>

        <Block id="profil" karte ebene="h2" titel={t.blockProfile} kurz={kurzProfil}>
          <p className="ct-help mb-4">{t.profileHint}</p>
          <h3 className="ct-label mb-1 text-ink">{t.bioTitle}</h3>
          <p className="ct-help mb-3">{t.bioHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.bioShortDe} htmlFor="bsd">
              <Textarea id="bsd" rows={3} value={draft.bio_short_de} onChange={(e) => set("bio_short_de", e.target.value)} />
            </Field>
            <Field label={t.bioShortEn} htmlFor="bse">
              <Textarea id="bse" rows={3} value={draft.bio_short_en} onChange={(e) => set("bio_short_en", e.target.value)} />
            </Field>
            <Field label={t.bioLongDe} htmlFor="bld">
              <Textarea id="bld" rows={5} value={draft.bio_long_de} onChange={(e) => set("bio_long_de", e.target.value)} />
            </Field>
            <Field label={t.bioLongEn} htmlFor="ble">
              <Textarea id="ble" rows={5} value={draft.bio_long_en} onChange={(e) => set("bio_long_en", e.target.value)} />
            </Field>
          </div>

          <h3 className="ct-label mb-3 mt-6 border-t pt-5 text-ink">{t.linksTitle}</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {SOCIAL_KEYS.map((k) => (
              <Field key={k} label={t[`social_${k}`] ?? k} htmlFor={`s-${k}`}>
                <Input id={`s-${k}`} value={draft[k]} onChange={(e) => set(k, e.target.value)} />
              </Field>
            ))}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={t.mic} htmlFor="mic" hint={t.micHint}>
              <Input id="mic" value={draft.mic} onChange={(e) => set("mic", e.target.value)} />
            </Field>
            <Field label={t.riderNotes} htmlFor="rn">
              <Textarea id="rn" rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
            <div className="flex flex-col gap-1">
              {RIDER_FLAGS.map((k) => (
                <Checkbox key={k} label={t[`rider_${k}`] ?? k} checked={draft[k]} onChange={(e) => set(k, e.target.checked)} />
              ))}
            </div>
          </div>
        </Block>

        <Block
          id="hospitality"
          karte
          ebene="h2"
          titel={tl.blockHospitality}
          marke={markeVon("hospitality")}
          kurz={kurzHospitality}
          offen={offenVon("hospitality")}
        >
          <p className="ct-help mb-4">{t.hospitalityHint}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.passType} htmlFor="pass">
              <Select id="pass" value={draft.pass_type} onChange={(e) => set("pass_type", e.target.value)} options={opt(labels.passType)} />
            </Field>
            <Field label={t.hospitalityStatus} htmlFor="hs">
              <Select id="hs" value={draft.hospitality_status} onChange={(e) => set("hospitality_status", e.target.value)} options={opt(labels.hospitality)} />
            </Field>
            <Field label={t.hotelTier} htmlFor="ht">
              <Select id="ht" value={draft.hotel_tier} onChange={(e) => set("hotel_tier", e.target.value)} options={opt(labels.hotelTier)} />
            </Field>
            <div className="flex flex-col justify-center gap-1">
              <Checkbox label={t.loungeAccess} checked={draft.lounge_access} onChange={(e) => set("lounge_access", e.target.checked)} />
              <Checkbox label={t.receptionEligible} checked={draft.reception_eligible} onChange={(e) => set("reception_eligible", e.target.checked)} />
              <Checkbox label={t.travelCostsCovered} checked={draft.travel_costs_covered} onChange={(e) => set("travel_costs_covered", e.target.checked)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="ct-small">
              {t.travelCostsApproval}:{" "}
              {speaker.travel_costs_approved_at ? (
                <Badge tone="success">
                  {datum.format(new Date(speaker.travel_costs_approved_at))}
                  {speaker.travel_costs_approved_by ? ` · ${speaker.travel_costs_approved_by}` : ""}
                </Badge>
              ) : (
                <Badge>{t.notApproved}</Badge>
              )}
            </span>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                fuehreAus(
                  () => approveTravelCosts(speaker.id, speaker.travel_costs_approved_at === null),
                  speaker.travel_costs_approved_at === null ? t.approved : t.approvalRevoked,
                )
              }
            >
              {speaker.travel_costs_approved_at === null ? t.approve : t.revokeApproval}
            </Button>
          </div>
          <Abrechnungsart
            speaker={speaker}
            labels={labels.expenseMode}
            pending={pending}
            onSave={(mode, cents) => fuehreAus(() => setExpenseMode(speaker.id, mode, cents), t.saved)}
            t={t}
            common={common}
          />

          {/* Die An- und Abreise trägt der Speaker selbst ein; hier steht nur, was da ist. */}
          <section className="mt-6 border-t pt-5">
            <h3 className="ct-label text-ink">{t.travelTitle}</h3>
            <p className="ct-help mb-3">{t.travelHint}</p>
            <div className="flex flex-col gap-3">
              {!speaker.travel && <p className="ct-small text-muted">{t.noTravel}</p>}
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {speaker.travel && (
                  <>
                    <Zeile label={t.arrival} value={reise(speaker.travel.arrival_date, speaker.travel.arrival_time, speaker.travel.arrival_mode, speaker.travel.arrival_ref, labels.travelMode, datum, common.none)} />
                    <Zeile label={t.departure} value={reise(speaker.travel.departure_date, speaker.travel.departure_time, speaker.travel.departure_mode, speaker.travel.departure_ref, labels.travelMode, datum, common.none)} />
                  </>
                )}
                {/* SPK-069: was gebucht ist, statt des alten Abhol-Hakens — auch ohne eingetragene Anreise. */}
                <Zeile label={t.shuttle} value={shuttleStand(speaker.shuttle, t)} />
                {speaker.travel && <Zeile label={t.travelNote} value={speaker.travel.note ?? common.none} />}
              </dl>
            </div>
          </section>
        </Block>

        <Block
          id="programm"
          karte
          ebene="h2"
          titel={tl.blockProgramme}
          marke={markeVon("programm")}
          kurz={kurzProgramm}
          offen={offenVon("programm")}
        >
          {sessions.length === 0 ? (
            <p className="ct-small text-muted">{t.noSessions}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sessions.map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-baseline gap-2 border-b pb-2 last:border-0">
                  <span className="ct-small font-medium">{s.title_de || s.title_en || common.none}</span>
                  {s.stage_name && <span className="ct-help text-muted">{s.stage_name}</span>}
                  {s.start_at && <span className="ct-help text-muted">{zeitpunkt.format(new Date(s.start_at))}</span>}
                  {s.publish_status && <Badge>{s.publish_status}</Badge>}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <ButtonLink href="/admin/programm" variant="secondary" size="sm">
              {tl.actionSession}
            </ButtonLink>
          </div>
        </Block>

        <p className="ct-help text-muted">
          {t.created} {zeitpunkt.format(new Date(speaker.created_at))} · {t.updated}{" "}
          {zeitpunkt.format(new Date(speaker.updated_at))}
        </p>

        {/* Der Balken klebt unten — aber nur, solange es etwas zu speichern gibt. Ein Knopf, der nichts tut, ist eine
            Einladung zum Leerklicken. */}
        {!unveraendert && (
          <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center justify-end gap-3 border-t bg-canvas px-1 py-3">
            <span className="ct-help mr-auto">{t.unsaved}</span>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setDraft(draftVon(speaker));
                setEinordnung(einordnungVorher);
              }}
            >
              {t.discard}
            </Button>
            {/* Mit einer Adresse in „Kontakt via“ nicht speichern — das Feld sagt, warum. */}
            <Button onClick={onSave} disabled={pending || adresse}>
              {common.save}
            </Button>
          </div>
        )}
      </div>

      {einladungFrage && (
        <ConfirmDialog
          title={tl.inviteConfirmTitle}
          body={speaker.person.email ? nenne(tl.inviteConfirmBody, { email: speaker.person.email }) : tl.inviteConfirmBodyNoMail}
          confirmLabel={tl.invite}
          cancelLabel={common.cancel}
          pending={pending}
          onConfirm={() => {
            setEinladungFrage(false);
            fuehreAus(() => inviteSpeaker(speaker.id), tl.invited);
          }}
          onCancel={() => setEinladungFrage(false)}
        />
      )}
    </>
  );
}

/**
 * Der Entwurf aus dem geladenen Datensatz.
 *
 * Als Funktion und nicht inline im `useState`, damit „Verwerfen" denselben
 * Ausgangszustand herstellt, gegen den auch verglichen wird — sonst laufen
 * Anzeige („Ungespeicherte Änderungen") und Wirklichkeit auseinander.
 */
function draftVon(speaker: SpeakerDetail) {
  const rider = (speaker.tech_rider ?? {}) as Record<string, unknown>;
  const socials = speaker.socials ?? {};
  return {
    speaker_type: speaker.speaker_type,
    job_title: speaker.job_title ?? "",
    organization_name: speaker.organization_name ?? "",
    bio_short_de: speaker.bio_short_de ?? "",
    bio_short_en: speaker.bio_short_en ?? "",
    bio_long_de: speaker.bio_long_de ?? "",
    bio_long_en: speaker.bio_long_en ?? "",
    pass_type: speaker.pass_type,
    hotel_tier: speaker.hotel_tier,
    hospitality_status: speaker.hospitality_status,
    lounge_access: speaker.lounge_access,
    reception_eligible: speaker.reception_eligible,
    travel_costs_covered: speaker.travel_costs_covered,
    internal_notes: speaker.internal_notes ?? "",
    mic: typeof rider.mic === "string" ? rider.mic : "",
    notes: typeof rider.notes === "string" ? rider.notes : "",
    own_laptop: rider.own_laptop === true,
    video: rider.video === true,
    website: socials.website ?? "",
    x: socials.x ?? "",
    instagram: socials.instagram ?? "",
  };
}

/** Die vier Einwilligungen des Portals, in seiner Reihenfolge. */
const EINWILLIGUNGEN: { art: string; label: string }[] = [
  { art: "photo_video", label: "consentLabelPhotoVideo" },
  { art: "speaker_release", label: "consentLabelSpeakerRelease" },
  { art: "slides_publication", label: "consentLabelSlides" },
  { art: "hospitality_data", label: "consentLabelHospitality" },
];

/**
 * SPK-074 (K-40): Einwilligungen der Speakerin, nur lesend. Geben kann sie das
 * Team nicht — nur die Speakerin selbst oder, im Verwaltet-Fall, der Kontakt
 * mit Zugang stellvertretend; der steht dann mit Namen und Tag da.
 */
function Einwilligungen({ rows, datum, t }: { rows: SpeakerConsentRow[]; datum: Intl.DateTimeFormat; t: Strings }) {
  const stand = new Map(rows.map((r) => [r.consent_type, r]));
  const text = (r: SpeakerConsentRow | undefined) => {
    if (!r) return t.consentNone;
    const tag = datum.format(new Date(r.granted_at));
    if (r.source === "stellvertretend" && r.by_name) {
      return (r.granted ? t.consentGrantedByProxy : t.consentNotGivenByProxy)
        .replace("{name}", r.by_name)
        .replace("{date}", tag);
    }
    return (r.granted ? t.consentGranted : t.consentNotGiven).replace("{date}", tag);
  };
  return (
    <section id="einwilligungen" className="mt-6 scroll-mt-20 border-t pt-5">
      <h3 className="ct-label text-ink">{t.consentsTitle}</h3>
      <p className="ct-help mb-3">{t.consentsHint}</p>
      <dl className="grid gap-x-6 gap-y-2">
        {EINWILLIGUNGEN.map(({ art, label }) => (
          <Zeile key={art} label={t[label]} value={text(stand.get(art))} />
        ))}
      </dl>
    </section>
  );
}

function Zeile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2">
      <dt className="ct-small text-muted">{label}</dt>
      <dd className="ct-small text-right">{value}</dd>
    </div>
  );
}

/** Datum, Uhrzeit, Verkehrsmittel und Nummer in einer Zeile — leer bleibt leer. */
function reise(
  date: string | null,
  time: string | null,
  mode: string | null,
  ref: string | null,
  modes: Record<string, string>,
  datum: Intl.DateTimeFormat,
  none: string,
): string {
  if (!date && !time && !mode && !ref) return none;
  return [
    date ? datum.format(new Date(`${date}T12:00:00`)) : null,
    time ? time.slice(0, 5) : null,
    mode ? (modes[mode] ?? mode) : null,
    ref,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Shuttle-Stand (SPK-069) in derselben Reihenfolge wie die Anreise-Liste:
 * erst, was bestätigt ist, dann, was noch offen ist — nur, was es gibt.
 */
function shuttleStand(s: { requested: number; confirmed: number } | undefined, t: Strings): string {
  const teile = [
    s && s.confirmed > 0 ? t.shuttleConfirmed.replace("{n}", String(s.confirmed)) : null,
    s && s.requested > 0 ? t.shuttleRequested.replace("{n}", String(s.requested)) : null,
  ].filter(Boolean);
  return teile.length > 0 ? teile.join(" · ") : t.shuttleNone;
}

/**
 * Pauschale oder Übernahme per Beleg (SPK-042).
 *
 * Konrad, 22.09.: „So haben wir zwei Arten von Deals. Entweder eine feste
 * Summe, die pauschal abgerechnet wird … oder die Übernahme per Beleg."
 *
 * Steht bewusst **nicht** im gemeinsamen Speichern-Balken: die Art zu wechseln
 * sperrt drüben die Belegerfassung, das ist keine Nebenwirkung eines Klicks auf
 * „Speichern" weiter unten. Der Betrag wird in Euro eingegeben und hier einmal
 * in Cent umgerechnet — gerechnet wird überall sonst nur noch in Cent.
 */
function Abrechnungsart({
  speaker,
  labels,
  pending,
  onSave,
  t,
  common,
}: {
  speaker: SpeakerDetail;
  labels: Record<string, string>;
  pending: boolean;
  onSave: (mode: string, cents: number | null) => void;
  t: Strings;
  common: { save: string };
}) {
  const [mode, setMode] = useState(speaker.expense_mode);
  const [betrag, setBetrag] = useState(
    speaker.expense_lump_sum_cents === null ? "" : (speaker.expense_lump_sum_cents / 100).toFixed(2),
  );

  // Komma wie Punkt: wer „1200,50" tippt, meint denselben Betrag wie mit Punkt.
  const cents = (() => {
    const n = Number(betrag.replace(",", ".").replace(/\s/g, ""));
    if (!betrag.trim() || !Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  })();
  const fehlt = mode === "lump_sum" && cents === null;
  const geaendert =
    mode !== speaker.expense_mode ||
    (mode === "lump_sum" && cents !== speaker.expense_lump_sum_cents);

  return (
    <div className="mt-4 border-t pt-4">
      <p className="ct-label text-ink">{t.expenseModeTitle}</p>
      <p className="ct-help mb-3">{t.expenseModeHint}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.expenseModeTitle} htmlFor="em">
          <Select
            id="em"
            value={mode}
            onChange={(e) => setMode(e.target.value as SpeakerDetail["expense_mode"])}
            options={Object.entries(labels).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        {mode === "lump_sum" && (
          <Field label={t.expenseAmount} htmlFor="ec" error={fehlt ? t.expenseAmountInvalid : undefined}>
            <Input
              id="ec"
              inputMode="decimal"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
          </Field>
        )}
        <Button
          className="mb-1"
          variant="secondary"
          disabled={pending || fehlt || !geaendert}
          onClick={() => onSave(mode, mode === "lump_sum" ? cents : null)}
        >
          {common.save}
        </Button>
      </div>
    </div>
  );
}
