"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Hackathon-Portal (QS-023). Leiste und Fuß bleiben; der Weg
 * führt zur Startseite des Hackathons.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function HackathonFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/hackathon" />;
}
