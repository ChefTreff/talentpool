import { notFound, redirect } from "next/navigation";
import { requireAdminSection } from "@/lib/auth";
import { BEREICH_ABSCHNITT, FRIST_BEREICHE, type FristBereich } from "@/lib/fristen/anzeige";

export const dynamic = "force-dynamic";

/**
 * `/admin/fristen/<bereich>` — die Adresse, die jeder Fristen-Abschnitt (`deadlinesSpeaker` …) trägt (ADM-099): wer dort
 * landet, kommt auf den Reiter seines Bereichs in der Übersicht. Eigene Adresse je Abschnitt, weil die Abschnittsliste
 * eindeutige Pfade verlangt und die Bereichsleitung so ohne Menüpunkt einen stabilen Link bekommt.
 */
export default async function FristenBereichPage({ params }: { params: Promise<{ bereich: string }> }) {
  const { bereich } = await params;
  if (!(FRIST_BEREICHE as readonly string[]).includes(bereich)) notFound();
  const b = bereich as FristBereich;
  await requireAdminSection(BEREICH_ABSCHNITT[b], `/admin/fristen/${b}`);
  redirect(b === "speaker" ? "/admin/fristen" : `/admin/fristen?bereich=${b}`);
}
