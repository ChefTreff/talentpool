"use client";

import { useState, type ReactNode } from "react";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { saveSpeakerConsents, saveSpeakerConsentsOnBehalf } from "../actions";
import { SPEAKER_CONSENTS, type SpeakerProfile } from "../types";
import { useProfilSpeichern } from "./useProfilSpeichern";

type Strings = Record<string, string>;

/**
 * Reiter „Ernährung & Einwilligungen“ (SPK-088): oben die Ernährungskarte (SPK-056), die die Seite fertig baut und die für sich speichert,
 * darunter die vier Einwilligungen mit ihrem eigenen „Speichern“. Für die Assistenz fehlt die Ernährung (sie darf die Angabe nicht lesen) und
 * die Einwilligungen stehen nur lesend da — außer im Verwaltet-Fall (SPK-074), dann bestätigt sie stellvertretend.
 */
export function EinwilligungenTab({
  profile,
  consentOnBehalf = false,
  ernaehrung,
  t,
  common,
  rpcMessages,
}: {
  profile: SpeakerProfile;
  /**
   * SPK-074 (K-40, K-45): wer für ein verwaltetes Profil arbeitet und dessen
   * Kontakt mit Zugang ist, bestätigt alle vier Einwilligungen stellvertretend
   * (`can_confirm_consent_on_behalf`) — mit der stellvertretenden Textfassung
   * (K-46).
   */
  consentOnBehalf?: boolean;
  /** Die Ernährungskarte, fertig von der Seite gebaut; `null` für die Assistenz. */
  ernaehrung?: ReactNode;
  t: Strings;
  common: {
    save: string;
    /** Rückfrage vor dem Verlassen mit ungesicherten Änderungen (QS-051). */
    unsaved: UngesichertTexte;
  };
  rpcMessages: Record<string, string>;
}) {
  const { pending, startTransition, report } = useProfilSpeichern(rpcMessages);

  const [consents, setConsents] = useState<Record<string, boolean>>(
    Object.fromEntries(SPEAKER_CONSENTS.map((c) => [c, profile.consents?.[c] === true])),
  );
  const [basis, setBasis] = useState(() => JSON.stringify(consents));
  const warnung = useUngesichert(JSON.stringify(consents) !== basis, common.unsaved);

  // Die Assistenz darf Profil und Inhalte pflegen, aber keine Einwilligung
  // geben und keine Assistenz einladen (Antwort 58, Abschnitt C). Ausnahme
  // (SPK-074, K-40, K-45): der Kontakt mit Zugang im Verwaltet-Fall bestätigt
  // alle vier Einwilligungen stellvertretend, mit der Textfassung „Ich
  // bestätige für <Name>, dass …“ (K-46).
  const stellvertretend = profile.is_assistant && consentOnBehalf;
  const readOnlyConsent = profile.is_assistant && !consentOnBehalf;
  const p = profile.person;
  const speakerName = [p.first_name, p.last_name].filter(Boolean).join(" ");

  function onSaveConsents() {
    const gespeichert = JSON.stringify(consents);
    startTransition(async () => {
      if (stellvertretend) {
        if (report(await saveSpeakerConsentsOnBehalf(profile.id, consents), t.consentSaved)) setBasis(gespeichert);
        return;
      }
      if (report(await saveSpeakerConsents(consents), t.consentSaved)) setBasis(gespeichert);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {warnung}
      {ernaehrung}

      <Card id="consent" className="p-6">
        <h2 className="ct-h2 mb-1 text-ink">{t.sectionConsent}</h2>
        {readOnlyConsent && <p className="ct-help mb-3">{t.consentReadOnly}</p>}
        {stellvertretend && <p className="ct-help mb-3">{t.consentOnBehalf.replace("{name}", speakerName || "—")}</p>}
        <div className="mt-3 flex flex-col gap-3">
          {SPEAKER_CONSENTS.map((key) => (
            <label key={key} className="flex items-start gap-2 ct-small">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={consents[key] === true}
                disabled={readOnlyConsent}
                onChange={(e) => setConsents((c) => ({ ...c, [key]: e.target.checked }))}
              />
              <span>
                {stellvertretend
                  ? t[`${consentLabelKey(key)}OnBehalf`].replaceAll("{name}", speakerName || "—")
                  : t[consentLabelKey(key)]}
                {/* SPK-078 (K-56): kein eigener Einwilligungstext für die Ernährung — der Hinweis sagt Zweck, Freiwilligkeit und Löschung. */}
                {key === "hospitality_data" && <span className="mt-1 block ct-help">{t.consentHospitalityHint}</span>}
              </span>
            </label>
          ))}
        </div>
        {!readOnlyConsent && (
          <div className="mt-6">
            <Button variant="secondary" onClick={onSaveConsents} loading={pending}>
              {stellvertretend ? t.consentOnBehalfSave : common.save}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Einwilligungsschlüssel → Textschlüssel im Wörterbuch. */
function consentLabelKey(key: string): string {
  return {
    photo_video: "consentPhotoVideo",
    speaker_release: "consentSpeakerRelease",
    slides_publication: "consentSlides",
    hospitality_data: "consentHospitality",
  }[key] ?? key;
}
