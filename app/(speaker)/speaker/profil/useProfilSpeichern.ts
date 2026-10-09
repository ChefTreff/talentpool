"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import type { SpeakerResult } from "../actions";

/**
 * Was jeder Reiter der Profilseite zum Speichern braucht (SPK-088): den Übergang für den Knopf, die Meldung zu einem
 * Fehlerschlüssel und die Rückmeldung nach dem Aufruf — ein Erfolg als Hinweis mit Neuladen der Seite, ein Fehler mit
 * Schlüsseltext (und Detail) als Hinweis. Vorher stand das einmal im großen Formular; jetzt hat jeder Reiter sein eigenes.
 */
export function useProfilSpeichern(rpcMessages: Record<string, string>) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function report(res: SpeakerResult, okText: string): boolean {
    if (res.ok) {
      toast("success", okText);
      router.refresh();
      return true;
    }
    toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
    return false;
  }

  return { pending, startTransition, message, report };
}
