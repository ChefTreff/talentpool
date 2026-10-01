"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze der Wurzel (QS-023): Startseite, Login, `/design`, Regie-Ansichten
 * und alles, was in einem Bereichs-Layout selbst ausfällt — dessen eigene
 * `error.tsx` liegt darunter und fängt es nicht. Kein Gerüst, deshalb mittig
 * auf eigener Fläche.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function WurzelFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/" rahmen="seite" />;
}
