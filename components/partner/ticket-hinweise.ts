/**
 * Die Hinweise oben auf der Ticketseite als Zeilen (PART-112, Konrad und Leopold 05.10.):
 *
 * 1. Jede Person braucht ein eigenes Ticket — die Bändchen sind nicht übertragbar, auch nicht bei wechselndem
 *    Standpersonal an Tag 1 und Tag 2.
 * 2. Mehr Tickets fürs Standpersonal gibt es über „Mehr Tickets anfragen“.
 *
 * Der zweite Hinweis zeigt auf einen Knopf und nennt ihn beim Namen aus dem Wörterbuch (`requestTitle`) — ändert
 * sich die Beschriftung, ändert sich der Hinweis mit. Wer den Knopf nicht sieht (`canRequest` ist falsch), bekommt
 * den Hinweis nicht: er zeigte ins Leere. Ohne React, damit die Tests die Auswahl ausführen.
 */
export function ticketHinweise(t: Record<string, string>, canRequest: boolean): string[] {
  return [
    t.ruleOwnTicket,
    ...(canRequest ? [t.ruleMoreTickets.replace("{button}", t.requestTitle)] : []),
  ];
}
