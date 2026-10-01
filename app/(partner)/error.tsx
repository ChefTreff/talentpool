"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Partner-Portal (QS-023). Leiste, Org-Wechsler und Fuß mit
 * dem Partner-Postfach bleiben; der Weg führt zur Partner-Startseite.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function PartnerFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/partner" />;
}
