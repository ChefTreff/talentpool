import { Card } from "@/components/ui/Card";

/**
 * „So kommst du zum CCH" (SPK-035).
 *
 * Stand vorher ganz unten auf der Seite — und, schlimmer, **innerhalb** des
 * Hotelteils: wer keinen Anspruch auf ein Zimmer hatte, bekam die Anfahrt gar
 * nicht zu sehen. Die braucht aber jeder, der kommt. Also eigener Abschnitt,
 * ganz oben, unabhängig vom Kontingent (Konrad, 21.09.: „steht ganz unten →
 * nach oben").
 */
export function Anfahrt({ t }: { t: { arrivalTitle: string; arrivalBody: string } }) {
  return (
    <Card className="p-6">
      <h2 className="ct-h3 mb-2 text-ink">{t.arrivalTitle}</h2>
      <p className="ct-help whitespace-pre-line">{t.arrivalBody}</p>
    </Card>
  );
}
