"use client";

import type { ErrorInfo } from "next/error";
import { Fehlergrenze } from "@/components/fehler/Fehlergrenze";

/**
 * Fehlergrenze im Admin-Bereich (QS-023). Leiste und Fuß bleiben; der Weg
 * führt zur Übersicht des Admin-Bereichs.
 * Aufbau und Regeln: `components/fehler/Fehlergrenze.tsx`.
 */
export default function AdminFehler({ error, retry }: ErrorInfo) {
  return <Fehlergrenze error={error} retry={retry} startHref="/admin" />;
}
