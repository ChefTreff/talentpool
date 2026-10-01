"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Speaker-Leads-Portal (QS-023). Leiste und Fuß bleiben; der
 * Weg führt zur Übersicht der Leads.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function SpeakerLeadsFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/speaker-leads" />;
}
