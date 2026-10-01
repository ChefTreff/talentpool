"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze am Einlass (QS-023). Das Kiosk hat kein Gerüst, also steht die
 * Meldung mittig auf eigener Fläche; „Neu laden" ist am Tablet der Weg, der
 * Link führt zurück zum Scanner.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function CheckinFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/checkin" rahmen="seite" />;
}
