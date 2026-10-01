"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Teilnehmer-Portal (QS-023). Leiste und Fuß bleiben; der Weg
 * führt nach `/start`, die Startseite der Teilnehmenden.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function TalentFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/start" />;
}
