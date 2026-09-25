"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { AbschnittsNavigation } from "@/components/ui/Abschnitte";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  approveTravelCosts,
  handoverSpeaker,
  inviteSpeaker,
  removeSpeakerContact,
  saveSpeaker,
  saveSpeakerContact,
  setContacts,
  setExpenseMode,
  setPipeline,
  setStageCandidates,
  type AdminResult,
} from "../actions";
import { KontakteCard } from "@/components/speaker/KontakteCard";
import { EinordnungFelder, type EinordnungOptionen } from "@/components/speaker/Einordnung";
import {
  buehnenGeaendert,
  einordnungAenderungen,
  einordnungEntwurf,
  kontaktViaHatAdresse,
} from "@/lib/speaker/einordnung";
import { RIDER_FLAGS, SOCIAL_KEYS, type ContactOption, type SpeakerDetail, type SpeakerManager } from "../types";

type Strings = Record<string, string>;

const TONE: Record<string, BadgeTone> = {
  confirmed: "success",
  onboarded: "success",
  ready: "success",
  published: "accent",
  attended: "accent",
  declined: "error",
};

/**
 * Das Detailblatt eines Speakers — **Archetyp B · Detail**
 * (`referenzen/muster.md`).
 *
 * Alles, was in `speaker_profile` steht, ist hier zu sehen — aber nicht alles
 * in einem einzigen Formular. Die Felder, die man beim Pflegen zusammen
 * anfasst, teilen sich einen Entwurf und **einen** Speichern-Knopf; alles, was
 * sofort wirkt und protokolliert wird (Status, Betreuung, Einladung,
 * Kostenfreigabe), ist eine eigene Handlung mit eigener Rückmeldung. Ein
 * gemeinsames „Speichern" über beides würde verwischen, was gerade passiert
 * ist.
 *
 * Drei Dinge machen den Archetyp aus, und alle drei lösen dasselbe Problem —
 * dass dreißig Felder in acht Karten gleich wichtig aussehen:
 *
 * 1. Das **Handlungsband** ganz oben sammelt, was sofort wirkt. Diese Dinge
 *    haben kein „Speichern", also dürfen sie nicht zwischen Formularfeldern
 *    stehen.
 * 2. **Zwei Spalten ab 1024 px:** links der Entwurf, rechts das Nur-Lesen.
 *    Was von woanders kommt (Reise, Sessions, Zeitstempel), sieht dann auch
 *    anders aus als das, was man hier ändert.
 * 3. Der **Speichern-Balken klebt unten und erscheint nur bei Änderungen**.
 *    Ein dauerhaft sichtbarer Knopf ohne Aufgabe ist eine Einladung zum
 *    Leerklicken — und danach weiß niemand mehr, ob etwas passiert ist.
 */
export function SpeakerDetailView({
  speaker,
  managers,
  contacts,
  labels,
  einordnungOptionen,
  dateLocale,
  word,
  t,
  te,
  common,
  rpcMessages,
}: {
  speaker: SpeakerDetail;
  managers: SpeakerManager[];
  contacts: ContactOption[];
  labels: Record<string, Record<string, string>>;
  /** Auswahllisten der Einordnung (LEAD-039): Vokabular und Bühnen der Edition. */
  einordnungOptionen: EinordnungOptionen;
  dateLocale: string;
  /** Das kursive Wort des Abschnitts im Seitenkopf (QS-037). */
  word: string;
  t: Strings;
  /** `speakerEinordnung`-Texte — dieselben wie im Fenster der Speaker-Leads. */
  te: Strings;
  common: { cancel: string; choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [draft, setDraft] = useState(() => draftVon(speaker));
  const [status, setStatus] = useState(speaker.pipeline_status);
  const [grund, setGrund] = useState(speaker.decline_reason ?? "");
  const [owner, setOwner] = useState(speaker.owner_person_id ?? "");
  const [lead, setLead] = useState(speaker.lead_contact_id ?? "");
  const [buddy, setBuddy] = useState(speaker.buddy_contact_id ?? "");
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

  function report(res: AdminResult, okText: string) {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
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

  const statusChanged = status !== speaker.pipeline_status;
  const declining = status === "declined";

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

      {/* Die Seite ist die laengste der Anwendung — zehn Karten untereinander,
          und man scrollt blind (QS-026). Die Abschnitte stehen hier einmal;
          dieselbe Liste spiegelt die Seitenleiste. */}
      <AbschnittsNavigation
        label={t.sectionsLabel}
        items={[
          { id: "status", label: t.pipelineTitle },
          { id: "betreuung", label: t.careTitle },
          { id: "stammdaten", label: t.basicsTitle },
          { id: "einordnung", label: te.title },
          { id: "bio", label: t.bioTitle },
          { id: "links", label: t.linksTitle },
          { id: "hospitality", label: t.hospitalityTitle },
          { id: "reise", label: t.travelTitle },
          { id: "sessions", label: t.sessionsTitle },
        ]}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[speaker.pipeline_status] ?? "neutral"}>
            {labels.pipeline[speaker.pipeline_status] ?? speaker.pipeline_status}
          </Badge>
          <Badge>{labels.speakerType[speaker.speaker_type] ?? speaker.speaker_type}</Badge>
          {speaker.confirmed_at && (
            <span className="ct-help text-muted">
              {t.confirmedOn} {datum.format(new Date(speaker.confirmed_at))}
            </span>
          )}
          {speaker.declined_at && (
            <span className="ct-help text-muted">
              {t.declinedOn} {datum.format(new Date(speaker.declined_at))}
              {speaker.decline_reason
                ? ` · ${labels.declineReason[speaker.decline_reason] ?? speaker.decline_reason}`
                : ""}
            </span>
          )}
          {speaker.person.has_account ? (
            <Badge tone="success">{t.hasAccount}</Badge>
          ) : (
            <Badge tone="warning">{t.noAccount}</Badge>
          )}
        </div>

        {/* --- Handlungsband: wirkt sofort, kein Speichern ------------------ */}
        <section aria-labelledby="sofort">
          <h2 id="sofort" className="ct-eyebrow mb-2 text-muted">
            {t.sectionActions}
          </h2>
          <p className="ct-help mb-3">{t.sectionActionsHint}</p>
          <div className="flex flex-col gap-4">
        <Card id="status">
          <CardHeader title={t.pipelineTitle} description={t.pipelineHint} />
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label={t.pipelineTitle} htmlFor="status">
              <Select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={opt(labels.pipeline)}
              />
            </Field>
            {declining && (
              <Field label={t.declineReason} htmlFor="grund">
                <Select
                  id="grund"
                  value={grund}
                  placeholder={common.choose}
                  onChange={(e) => setGrund(e.target.value)}
                  options={opt(labels.declineReason)}
                />
              </Field>
            )}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={pending || !statusChanged || (declining && grund === "")}
                onClick={() =>
                  startTransition(async () =>
                    report(await setPipeline(speaker.id, status, declining ? grund : null), t.statusSaved),
                  )
                }
              >
                {t.setStatus}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => report(await inviteSpeaker(speaker.id), t.invited))
                }
              >
                {speaker.invited_at ? t.inviteAgain : t.invite}
              </Button>
            </div>
          </div>
          {speaker.invited_at && (
            <p className="ct-help mt-3 text-muted">
              {t.invitedOn} {zeitpunkt.format(new Date(speaker.invited_at))}
            </p>
          )}
        </Card>

        <Card id="betreuung">
          <CardHeader title={t.careTitle} description={t.careHint} />
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label={t.owner} htmlFor="owner" className="sm:col-span-2">
              <Select
                id="owner"
                value={owner}
                placeholder={t.withoutOwner}
                onChange={(e) => setOwner(e.target.value)}
                options={managers.map((m) => ({
                  value: m.person_id,
                  label: m.display_name ?? m.email ?? m.person_id,
                }))}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={pending || owner === (speaker.owner_person_id ?? "")}
              onClick={() =>
                startTransition(async () =>
                  report(await handoverSpeaker(speaker.id, owner || null), t.ownerSaved),
                )
              }
            >
              {t.setOwner}
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3 sm:items-end">
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
              onClick={() =>
                startTransition(async () =>
                  report(await setContacts(speaker.id, lead || null, buddy || null), t.contactsSaved),
                )
              }
            >
              {t.setContacts}
            </Button>
          </div>

          {/* Assistenz, Agentur und Office in einer Liste (SPK-040, 0148).
              Dieselbe Karte wie im Speaker-Portal — „Admin-Vollständigkeit":
              was das Team dort sieht, kann es hier auch pflegen. */}
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
        </Card>

          </div>
        </section>

        {/* --- Zwei Spalten: links der Entwurf, rechts das Nur-Lesen --------
            Unter 1024 px untereinander, Entwurf zuerst — wer auf dem Telefon
            ein Detailblatt öffnet, will ändern, nicht nachschlagen. */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="entwurf" className="flex flex-col gap-4">
          <div>
            <h2 id="entwurf" className="ct-eyebrow text-muted">
              {t.sectionDraft}
            </h2>
            <p className="ct-help">{t.sectionDraftHint}</p>
          </div>
        <Card id="stammdaten">
          <CardHeader title={t.basicsTitle} />
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
        </Card>

        {/* Einordnung aus der Arbeitstabelle (LEAD-039) — dieselben Felder wie im
            Fenster der Speaker-Leads, im gemeinsamen Speichern-Balken. */}
        <Card id="einordnung">
          <CardHeader title={te.title} description={te.hint} />
          <EinordnungFelder
            idPrefix="einordnung"
            value={einordnung}
            onChange={setEinordnung}
            optionen={einordnungOptionen}
            t={te}
            none={common.none}
            disabled={pending}
          />
        </Card>

        <Card id="bio">
          <CardHeader title={t.bioTitle} description={t.bioHint} />
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
        </Card>

        <Card id="links">
          <CardHeader title={t.linksTitle} />
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
            <div className="flex flex-col gap-2">
              {RIDER_FLAGS.map((k) => (
                <label key={k} className="flex items-center gap-2 ct-small">
                  <input
                    type="checkbox"
                    checked={draft[k]}
                    onChange={(e) => set(k, e.target.checked)}
                    className="size-4"
                  />
                  {t[`rider_${k}`] ?? k}
                </label>
              ))}
            </div>
          </div>
        </Card>

        <Card id="hospitality">
          <CardHeader title={t.hospitalityTitle} description={t.hospitalityHint} />
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
            <div className="flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 ct-small">
                <input type="checkbox" checked={draft.lounge_access} onChange={(e) => set("lounge_access", e.target.checked)} className="size-4" />
                {t.loungeAccess}
              </label>
              <label className="flex items-center gap-2 ct-small">
                <input type="checkbox" checked={draft.reception_eligible} onChange={(e) => set("reception_eligible", e.target.checked)} className="size-4" />
                {t.receptionEligible}
              </label>
              <label className="flex items-center gap-2 ct-small">
                <input type="checkbox" checked={draft.travel_costs_covered} onChange={(e) => set("travel_costs_covered", e.target.checked)} className="size-4" />
                {t.travelCostsCovered}
              </label>
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
                startTransition(async () =>
                  report(
                    await approveTravelCosts(speaker.id, speaker.travel_costs_approved_at === null),
                    speaker.travel_costs_approved_at === null ? t.approved : t.approvalRevoked,
                  ),
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
            onSave={(mode, cents) =>
              startTransition(async () => report(await setExpenseMode(speaker.id, mode, cents), t.saved))
            }
            t={t}
            common={common}
          />
        </Card>

        {speaker.internal_notes_visible ? (
          <Card>
            <CardHeader title={t.notesTitle} description={t.notesHint} />
            <Textarea
              rows={4}
              value={draft.internal_notes}
              onChange={(e) => set("internal_notes", e.target.value)}
            />
          </Card>
        ) : (
          <Card>
            <CardHeader title={t.notesTitle} />
            <p className="ct-small text-muted">{t.notesHidden}</p>
          </Card>
        )}

          {/* Der Balken klebt unten — aber nur, solange es etwas zu speichern
              gibt. Ein Knopf, der nichts tut, ist eine Einladung zum
              Leerklicken. */}
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
        </section>

        {/* --- Nur lesen ---------------------------------------------------- */}
        <section aria-labelledby="nurlesen" className="flex flex-col gap-4">
          <div>
            <h2 id="nurlesen" className="ct-eyebrow text-muted">
              {t.sectionReadonly}
            </h2>
            <p className="ct-help">{t.sectionReadonlyHint}</p>
          </div>
        <Card id="reise">
          <CardHeader title={t.travelTitle} description={t.travelHint} />
          {speaker.travel ? (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Zeile label={t.arrival} value={reise(speaker.travel.arrival_date, speaker.travel.arrival_time, speaker.travel.arrival_mode, speaker.travel.arrival_ref, labels.travelMode, datum, common.none)} />
              <Zeile label={t.departure} value={reise(speaker.travel.departure_date, speaker.travel.departure_time, speaker.travel.departure_mode, speaker.travel.departure_ref, labels.travelMode, datum, common.none)} />
              <Zeile label={t.pickup} value={speaker.travel.needs_pickup ? t.yes : t.no} />
              <Zeile label={t.travelNote} value={speaker.travel.note ?? common.none} />
            </dl>
          ) : (
            <p className="ct-small text-muted">{t.noTravel}</p>
          )}
        </Card>

        <Card id="sessions">
          <CardHeader title={t.sessionsTitle} />
          {speaker.sessions.length === 0 ? (
            <p className="ct-small text-muted">{t.noSessions}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {speaker.sessions.map((s) => (
                <li key={s.session_id} className="flex flex-wrap items-baseline gap-2 border-b pb-2 last:border-0">
                  <span className="ct-small font-medium">{s.title_de || s.title_en || common.none}</span>
                  {s.stage_name && <span className="ct-help text-muted">{s.stage_name}</span>}
                  {s.start_at && <span className="ct-help text-muted">{zeitpunkt.format(new Date(s.start_at))}</span>}
                  {s.publish_status && <Badge>{s.publish_status}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="ct-help text-muted">
          {t.created} {zeitpunkt.format(new Date(speaker.created_at))} · {t.updated}{" "}
          {zeitpunkt.format(new Date(speaker.updated_at))}
        </p>
        </section>
        </div>
      </div>
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
