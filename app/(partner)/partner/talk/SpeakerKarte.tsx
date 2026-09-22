"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { updateTalkSpeaker } from "../actions";
import type { PartnerSpeaker } from "./types";

type Strings = Record<string, string>;

/**
 * Ein eingetragener Speaker: Anzeige, und darunter das Formular — aber nur,
 * wenn der Partner pflegen darf.
 *
 * **Das Recht endet mit dem ersten Login der Speakerin** (`can_edit`, Trigger
 * aus 0132). Danach zeigt die Karte Name und Status und sagt in einem Satz,
 * warum hier nichts mehr zu tun ist. Ein ausgegrautes Formular wäre die
 * schlechtere Antwort: es sieht nach einem Fehler aus, nicht nach einer Regel.
 *
 * Dasselbe gilt für eine Person, die der Partner nur über ihre Mailadresse
 * zugeordnet hat — sie gab es im Portal schon, ihre Angaben gehören ihr.
 */
export function SpeakerKarte({
  speaker,
  canEdit,
  t,
  rpcMessages,
}: {
  speaker: PartnerSpeaker;
  /** Rolle in der Organisation. Ohne sie ist die Karte nur Anzeige. */
  canEdit: boolean;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [offen, setOffen] = useState(false);
  const [draft, setDraft] = useState({
    // Getrennt aus der RPC, nicht aus dem Anzeigenamen zerlegt: „Anna von der
    // Heide" wäre sonst beim Speichern zu Vorname „Anna von der" geworden.
    first_name: speaker.first_name ?? "",
    last_name: speaker.last_name ?? "",
    title: speaker.title ?? "",
    job_title: speaker.job_title ?? "",
    organization_name: speaker.organization_name ?? "",
    bio_short_de: speaker.bio_short_de ?? "",
    bio_short_en: speaker.bio_short_en ?? "",
    linkedin_url: speaker.linkedin_url ?? "",
  });

  const darfPflegen = canEdit && speaker.can_edit;

  function speichern() {
    startSaving(async () => {
      const res = await updateTalkSpeaker({
        profileId: speaker.profile_id,
        // Leere Felder werden zu null: „nicht gesetzt" statt leerer Text.
        fields: Object.fromEntries(
          Object.entries(draft).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]),
        ),
      });
      if (!res.ok) {
        toast("error", rpcMessages[res.key] ?? rpcMessages.unknown);
        return;
      }
      toast("success", t.saved);
      setOffen(false);
      router.refresh();
    });
  }

  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="ct-h3 text-ink">{speaker.display_name || t.unnamed}</h3>
        <div className="flex flex-wrap gap-2">
          {speaker.confirmed && <Badge tone="success">{t.confirmed}</Badge>}
          {!speaker.can_edit && <Badge tone="neutral">{t.ownsData}</Badge>}
        </div>
      </div>

      {speaker.can_edit ? (
        <p className="ct-help mt-1">
          {[speaker.job_title, speaker.organization_name].filter(Boolean).join(" · ") || t.noRoleYet}
        </p>
      ) : (
        // Kein ausgegrautes Formular: ein Satz, der die Regel erklärt.
        <p className="ct-help mt-1">{t.ownsDataBody}</p>
      )}

      {darfPflegen && !offen && (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setOffen(true)}>
            {t.edit}
          </Button>
        </div>
      )}

      {darfPflegen && offen && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t.firstName} htmlFor={`fn-${speaker.profile_id}`}>
              <Input
                id={`fn-${speaker.profile_id}`}
                value={draft.first_name}
                onChange={(e) => setDraft({ ...draft, first_name: e.target.value })}
              />
            </Field>
            <Field label={t.lastName} htmlFor={`ln-${speaker.profile_id}`}>
              <Input
                id={`ln-${speaker.profile_id}`}
                value={draft.last_name}
                onChange={(e) => setDraft({ ...draft, last_name: e.target.value })}
              />
            </Field>
            <Field label={t.academicTitle} htmlFor={`ti-${speaker.profile_id}`} hint={t.academicTitleHint}>
              <Input
                id={`ti-${speaker.profile_id}`}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label={t.jobTitle} htmlFor={`jt-${speaker.profile_id}`}>
              <Input
                id={`jt-${speaker.profile_id}`}
                value={draft.job_title}
                onChange={(e) => setDraft({ ...draft, job_title: e.target.value })}
              />
            </Field>
            <Field label={t.organization} htmlFor={`or-${speaker.profile_id}`}>
              <Input
                id={`or-${speaker.profile_id}`}
                value={draft.organization_name}
                onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })}
              />
            </Field>
            <Field label={t.linkedin} htmlFor={`li-${speaker.profile_id}`}>
              <Input
                id={`li-${speaker.profile_id}`}
                type="url"
                value={draft.linkedin_url}
                onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t.bioDe} htmlFor={`bd-${speaker.profile_id}`} hint={t.bioHint}>
            <Textarea
              id={`bd-${speaker.profile_id}`}
              rows={3}
              value={draft.bio_short_de}
              onChange={(e) => setDraft({ ...draft, bio_short_de: e.target.value })}
            />
          </Field>
          <Field label={t.bioEn} htmlFor={`be-${speaker.profile_id}`}>
            <Textarea
              id={`be-${speaker.profile_id}`}
              rows={3}
              value={draft.bio_short_en}
              onChange={(e) => setDraft({ ...draft, bio_short_en: e.target.value })}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={speichern} disabled={saving}>
              {saving ? t.saving : t.save}
            </Button>
            <Button variant="ghost" onClick={() => setOffen(false)} disabled={saving}>
              {t.cancel}
            </Button>
          </div>
          <p className="ct-help">{t.privateFields}</p>
        </div>
      )}
    </div>
  );
}
