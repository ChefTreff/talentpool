"use client";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * „Deine Folien nach dem Summit teilen?" (SPK-055).
 *
 * Konrad, 24.09.: „Für Summit Slides freigeben" war verwirrend — heisst das,
 * dass wir die Folien verarbeiten? Dass sie irgendwo geteilt werden? Deshalb
 * eine klare Frage, **nach dem Upload** und nicht zu übersehen, mit dem, was
 * danach passiert: wer die Folien sieht, ab wann und dass man es zurücknehmen
 * kann.
 *
 * **Ja heisst auch: Einwilligung.** Die Einwilligung `slides_publication`
 * lautet „Meine Präsentation darf nach dem Summit geteilt werden" — genau das,
 * was hier gefragt wird. Wer beim ersten Anmelden noch nicht zugestimmt hat,
 * stimmt mit „Ja, teilen" zu; der Text darüber sagt, wozu. Die Seite schreibt
 * die Einwilligung dann versioniert, bevor sie teilt.
 *
 * Nein ist gleichwertig: kein Nachhaken, kein zweiter Dialog. Die Frage steht
 * danach weiter an der Datei, falls man es sich anders überlegt.
 */
export function FolienTeilenDialog({
  dateiname,
  pending,
  onJa,
  onNein,
  t,
}: {
  dateiname: string;
  pending: boolean;
  onJa: () => void;
  onNein: () => void;
  t: { title: string; body: string; who: string; undo: string; yes: string; no: string };
}) {
  return (
    <Modal label={t.title} onCancel={onNein}>
      <h2 className="ct-h3 mb-2 text-ink">{t.title}</h2>
      <p className="ct-help mb-3">{dateiname}</p>
      <p className="ct-small mb-2 leading-6">{t.body}</p>
      <p className="ct-small mb-2 leading-6">{t.who}</p>
      <p className="ct-help">{t.undo}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button loading={pending} onClick={onJa}>
          {t.yes}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={onNein}>
          {t.no}
        </Button>
      </div>
    </Modal>
  );
}
