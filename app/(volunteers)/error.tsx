"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Volunteer-Portal (QS-023). Leiste und Fuß bleiben; der Weg
 * führt zur Volunteer-Startseite.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function VolunteersFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/volunteers" />;
}
