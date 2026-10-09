"use client";

import { KontakteCard } from "@/components/speaker/KontakteCard";
import { removeSpeakerContact, saveSpeakerContact } from "../actions";
import type { SpeakerProfile } from "../types";

/**
 * „Deine Kontakte“ auf ihrer eigenen Seite (SPK-089): dieselbe Karte wie im Admin-Detail, ohne eigenen Titel (die Seite trägt ihn).
 * Client, weil die Karte eine Funktion für die Fehlertexte braucht — eine Funktion überquert die Server-Client-Grenze nicht.
 * Die Assistenz sieht die Liste, ändert sie aber nicht (`readOnly`): wer eingeladen wird, entscheidet die Speakerin.
 */
export function KontakteSeite({
  profile,
  t,
  common,
  rpcMessages,
}: {
  profile: SpeakerProfile;
  t: Record<string, string>;
  common: { cancel: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  return (
    <KontakteCard
      id="kontakte"
      kontakte={profile.contacts ?? []}
      readOnly={profile.is_assistant}
      aktionen={{ save: saveSpeakerContact, remove: removeSpeakerContact }}
      t={t}
      common={common}
      message={message}
      ebene="h2"
      ohneTitel
    />
  );
}
