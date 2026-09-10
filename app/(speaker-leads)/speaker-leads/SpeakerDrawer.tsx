"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import {
  approveTravelCosts,
  inviteSpeaker,
  setPipeline,
  updateSpeaker,
  type LeadResult,
} from "./actions";
import { PIPELINE_ORDER, type ManagedSpeaker } from "./types";

type Strings = Record<string, string>;

export function SpeakerDrawer({
  speaker,
  isTeam,
  labels,
  locale,
  dateLocale,
  t,
  common,
  rpcMessages,
  onClose,
}: {
  speaker: ManagedSpeaker;
  /** Team darf zusätzlich Pass, Lounge, Hotel-Tier und Hospitality setzen. */
  isTeam: boolean;
  labels: Record<string, Record<string, string>>;
  locale: Locale;
  dateLocale: string;
  t: Strings;
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
      report(await updateSpeaker(speaker.id, data), t.saved);
    });
  }

  const opt = (map: Record<string, string>) =>
    Object.entries(map).map(([value, label]) => ({ value, label }));

  return (
    <Drawer open onClose={onClose} closeLabel={common.close} title={name}>
      <div className="flex flex-col gap-5">
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
                onClick={() =>
                  startTransition(async () =>
                    void report(await setPipeline(speaker.id, s), t.pipelineSaved),
                  )
                }
              >
                {labels.pipeline[s] ?? s}
              </Button>
            ))}
          </div>
          <p className="ct-help mt-2">{t.pipelineHint}</p>
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
            <label className="flex items-center gap-2 text-[14px] font-semibold">
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
            <label className="flex items-center gap-2 text-[14px] font-semibold">
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
              <label className="flex items-center gap-2 self-end pb-2 text-[14px] font-semibold">
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

      <div className="mt-6 flex flex-wrap gap-2 border-t pt-4">
        <Button onClick={onSave} loading={pending}>
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
      </div>
    </Drawer>
  );
}
