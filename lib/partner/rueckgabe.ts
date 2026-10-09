/**
 * Offen ist eine Rückgabe, solange die Session wieder beim Partner liegt
 * (`draft`). Der Grund bleibt bis zur Freigabe gespeichert — nach einer neuen
 * Anfrage (`review`) ist die Programmleitung wieder dran, und „reicht erneut
 * ein“ wäre dann die falsche Aufforderung.
 *
 * Eine reine Funktion, damit auch die Vorgabe der Umschalter (QS-079: die Instanz, die etwas von der Person will) sie ohne Oberfläche benutzt.
 * `app/(partner)/partner/Rueckgabe.tsx` reicht sie weiter, die bisherigen Importe bleiben.
 */
export function rueckgabeOffen<
  T extends { return_note: string | null; returned_at: string | null; publish_status: string | null },
>(x: T): x is T & { return_note: string; returned_at: string } {
  return !!x.return_note && !!x.returned_at && x.publish_status === "draft";
}
