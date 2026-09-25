"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { EinordnungFelder, type EinordnungOptionen } from "@/components/speaker/Einordnung";
import { Verlauf } from "@/components/speaker/Verlauf";
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
  setPipeline,
  setStageCandidates,
  updateSpeaker,
  type LeadResult,
} from "./actions";
import { PIPELINE_ORDER, type ManagedSpeaker, type ManagerOption } from "./types";

type Strings = Record<string, string>;

/**
 * Ein Speaker als zentrales Fenster (LEAD-026, Konrad 24.09.: „die
 * Seitenleiste ist zu schmal für die Informationsfülle; nach dem Speichern
 * bleibt der Kontakt offen“). Zwei Spalten: links, wo die Ansprache steht —
 * Pipeline und Einordnung (LEAD-039) —, rechts die Stammdaten, Sessions,
 * Übergabe und Reisekosten. „Speichern“ schliesst das Fenster.
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
  /** Offener Absage-Dialog: `null` = zu, sonst der gewählte Grund. */
  const [absage, setAbsage] = useState<string | null>(null);
  /** Empfänger einer Übergabe. */
  const [nachfolge, setNachfolge] = useState("");

  const [draft, setDraft] = useState({
    speaker_type: speaker.speaker_type,
    job_title: speaker.job_title ?? "",
    organization_name: speaker.organization_name ?? "",
    internal_notes: speaker.internal_notes ?? "",
    reception_eligible: speaker.reception_eligible,
    travel_costs_covered: speaker.travel_costs_covered,
    pass_type: speaker.pass_type,
    lounge_access: speaker.lounge_access,
    hotel_tier: speaker.hotel_tier,
    hospitality_status: speaker.hospitality_status,
  });

  // Einordnung (LEAD-039): der gespeicherte Stand und der Entwurf daneben — so
  // geht nur mit, was sich geändert hat.
  const einordnungVorher = useMemo(() => einordnungEntwurf(speaker), [speaker]);
  const [einordnung, setEinordnung] = useState(einordnungVorher);
  const adresse = kontaktViaHatAdresse(einordnung.contact_via);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const dateTime = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const name =
    [speaker.title, speaker.first_name, speaker.last_name].filter(Boolean).join(" ") ||
    common.none;

  function report(res: LeadResult, okText: string) {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
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

  return (
    <Modal label={name} onCancel={onClose} size="wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="ct-h3 text-ink">{name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{labels.pipeline[speaker.pipeline_status] ?? speaker.pipeline_status}</Badge>
            {speaker.assistant_name && (
              <Badge tone="accent">
                {t.assistant}: {speaker.assistant_name}
              </Badge>
            )}
            {speaker.invited_at && (
              <span className="ct-help">
                {t.invitedOn} {dateTime.format(new Date(speaker.invited_at))}
              </span>
            )}
          </div>
          {/* Kontakt: die RPC gibt die Adresse nur im Scope heraus. */}
          {speaker.email ? (
            <p className="ct-help">{speaker.email}</p>
          ) : (
            <p className="ct-help">{t.contactHidden}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {common.close}
        </Button>
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {/* Pipeline */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-2 text-ink">{t.pipeline}</h3>
            <div className="flex flex-wrap gap-1">
              {PIPELINE_ORDER.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === speaker.pipeline_status ? "primary" : "secondary"}
                  disabled={pending || s === speaker.pipeline_status}
                  onClick={() => {
                    // Bei einer Absage fragen wir nach dem Grund, bevor wir
                    // umschalten — hinterher trägt ihn niemand mehr nach, und
                    // für die nächste Edition ist er mehr wert als die Absage.
                    if (s === "declined") {
                      setAbsage(speaker.decline_reason ?? "");
                      return;
                    }
                    startTransition(async () =>
                      void report(await setPipeline(speaker.id, s), t.pipelineSaved),
                    );
                  }}
                >
                  {labels.pipeline[s] ?? s}
                </Button>
              ))}
            </div>
            <p className="ct-help mt-2">{t.pipelineHint}</p>

            {/* Zeitstempel aus Migration 0099: sie sagen, wie lange eine Zusage
                gedauert hat und warum jemand abgesagt hat. */}
            <dl className="ct-help mt-3 flex flex-col gap-0.5">
              {speaker.confirmed_at && (
                <div className="flex gap-1">
                  <dt className="font-semibold">{t.confirmedOn}:</dt>
                  <dd>{dateTime.format(new Date(speaker.confirmed_at))}</dd>
                </div>
              )}
              {speaker.declined_at && (
                <div className="flex gap-1">
                  <dt className="font-semibold">{t.declinedOn}:</dt>
                  <dd>
                    {dateTime.format(new Date(speaker.declined_at))}
                    {speaker.decline_reason &&
                      ` · ${labels.declineReason[speaker.decline_reason] ?? speaker.decline_reason}`}
                  </dd>
                </div>
              )}
            </dl>

            {absage !== null && (
              <div className="mt-3 flex flex-col gap-2 rounded-ct-sm border bg-canvas p-3">
                <Field label={t.declineReason} htmlFor="absage-grund" hint={t.declineReasonHint}>
                  <Select
                    id="absage-grund"
                    value={absage}
                    placeholder={common.choose}
                    options={opt(labels.declineReason)}
                    onChange={(e) => setAbsage(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={pending || absage === ""}
                    onClick={() =>
                      startTransition(async () => {
                        const grund = absage;
                        setAbsage(null);
                        void report(
                          await setPipeline(speaker.id, "declined", grund),
                          t.pipelineSaved,
                        );
                      })
                    }
                  >
                    {t.declineConfirm}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAbsage(null)}>
                    {common.cancel}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Einordnung aus der Arbeitstabelle (LEAD-039) */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-1 text-ink">{te.title}</h3>
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

        <div className="flex min-w-0 flex-col gap-5">
          {/* Verlauf (LEAD-039 Schnitt 2): Notizen, Kontakte, Aufgaben mit Frist —
              oben rechts, weil er in der Akquise am häufigsten gebraucht wird. */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-1 text-ink">{tv.title}</h3>
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

          {/* Stammdaten */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-3 text-ink">{t.details}</h3>
            <div className="flex flex-col gap-4">
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
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, organization_name: e.target.value }))
                  }
                />
              </Field>
              <label className="flex items-center gap-2 ct-label">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={draft.reception_eligible}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, reception_eligible: e.target.checked }))
                  }
                />
                {t.receptionEligible}
              </label>
              <label className="flex items-center gap-2 ct-label">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={draft.travel_costs_covered}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, travel_costs_covered: e.target.checked }))
                  }
                />
                {t.travelCovered}
              </label>
              <Field label={t.internalNotes} htmlFor="notes" hint={t.internalNotesHint}>
                <Textarea
                  id="notes"
                  rows={2}
                  value={draft.internal_notes}
                  onChange={(e) => setDraft((d) => ({ ...d, internal_notes: e.target.value }))}
                />
              </Field>
            </div>
          </section>

          {/* Team-Felder — für Manager gar nicht erst sichtbar */}
          {isTeam && (
            <section className="border-t pt-4">
              <h3 className="ct-label mb-1 text-ink">{t.teamFields}</h3>
              <p className="ct-help mb-3">{t.teamFieldsHint}</p>
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
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, hospitality_status: e.target.value }))
                    }
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 ct-label">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={draft.lounge_access}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, lounge_access: e.target.checked }))
                    }
                  />
                  {t.fieldLounge}
                </label>
              </div>
            </section>
          )}

          {/* Sessions und offene Schritte */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-2 text-ink">{t.sessions}</h3>
            {(speaker.sessions ?? []).length === 0 ? (
              <p className="ct-help">{t.noSessionHint}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(speaker.sessions ?? []).map((s) => (
                  <li key={s.session_id} className="ct-help">
                    {(locale === "en" ? s.title_en : s.title_de) ?? s.title_de ?? "—"}
                    {s.stage_name && ` · ${s.stage_name}`}
                    {s.start_at && ` · ${dateTime.format(new Date(s.start_at))}`}
                    {s.publish_status && ` · ${s.publish_status}`}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="ct-label mb-2 mt-4 text-ink">{t.openSteps}</h3>
            {(speaker.next_open ?? []).length === 0 ? (
              <Badge tone="success">{t.allDone}</Badge>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(speaker.next_open ?? []).map((step) => (
                  <Badge key={step}>{t[`step_${step}`] ?? step}</Badge>
                ))}
              </div>
            )}
          </section>

          {/* Betreuung weitergeben.

              Angeboten wird das nur, wo es auch erlaubt ist: das Team darf jeden
              zuordnen, eine Lead-Person nur abgeben, was sie heute selbst
              betreut (Migration 0103). Der Knopf für alle wäre bei der Hälfte
              der Zeilen eine Einladung in den Fehler. */}
          {(isTeam || speaker.owner_person_id === meId) && (
            <section className="border-t pt-4">
              <h3 className="ct-label mb-1 text-ink">{t.handover}</h3>
              <p className="ct-help mb-3">
                {speaker.owner_name ? `${t.currentOwner}: ${speaker.owner_name}` : t.noOwner}
              </p>
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
                  variant="secondary"
                  disabled={pending || nachfolge === ""}
                  onClick={() =>
                    startTransition(async () =>
                      void report(await handoverSpeaker(speaker.id, nachfolge), t.handedOver),
                    )
                  }
                >
                  {t.handoverAction}
                </Button>
              </div>
            </section>
          )}

          {/* Reisekosten */}
          <section className="border-t pt-4">
            <h3 className="ct-label mb-2 text-ink">{t.travel}</h3>
            <p className="ct-help">
              {speaker.travel_costs_covered ? t.travelCoveredYes : t.travelCoveredNo}
              {" · "}
              {speaker.travel_costs_approved ? t.travelApprovedYes : t.travelApprovedNo}
            </p>
            <p className="ct-help mt-1">{t.travelApproveHint}</p>
            {/* Freigeben darf nur Bereichsleitung oder Admin (`approve_travel_costs`
                antwortet sonst 42501). Einem Manager den Knopf zu zeigen, den er
                nicht drücken kann, wäre nur eine Einladung in den Fehler. */}
            {isTeam && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={pending || speaker.travel_costs_approved}
                  onClick={() =>
                    startTransition(async () =>
                      void report(await approveTravelCosts(speaker.id, true), t.travelApproved),
                    )
                  }
                >
                  {t.travelApprove}
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Die Leiste klebt am unteren Rand des Fensters: es ist lang, und
          „Speichern“ soll nicht erst nach dem Scrollen zu finden sein. */}
      <div className="sticky -bottom-6 -mx-6 -mb-6 mt-6 flex flex-wrap gap-2 border-t bg-surface px-6 py-4">
        {/* Mit einer Adresse in „Kontakt via“ wird nicht gespeichert — das Feld
            sagt, warum (kein Toast für einen Formularfehler). */}
        <Button onClick={onSave} loading={pending} disabled={adresse}>
          {common.save}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () =>
              void report(await inviteSpeaker(speaker.id), t.invited),
            )
          }
        >
          {speaker.invited_at ? t.inviteAgain : t.invite}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={onClose}>
          {common.close}
        </Button>
      </div>
    </Modal>
  );
}
