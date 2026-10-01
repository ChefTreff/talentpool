"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Speaker-Portal (QS-023). Leiste und Fuß mit dem Speaker-
 * Postfach bleiben, die Sprache ist die des Portals (Englisch, wenn niemand
 * gewählt hat).
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function SpeakerFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/speaker" />;
}
