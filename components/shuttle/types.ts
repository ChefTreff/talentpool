/**
 * Gemeinsame Teile des Shuttles (Migration 0119).
 *
 * Drei Oberflaechen zeigen dieselben Fahrten: das Speaker-Portal, der
 * Lead-Bereich und der Speaker-Admin. Der Typ und die Feldliste stehen deshalb
 * hier und nicht in einer der drei — sonst laufen sie auseinander, sobald an
 * einer Stelle ein Feld dazukommt.
 */
/**
 * Eine Shuttle-Fahrt (`my_shuttle_bookings`, Migration 0119).
 *
 * Die Felder sind die der Airtable-Shuttle-Tabelle 2026. `passenger_name` steht
 * bewusst an der Fahrt und nicht an der Person: gefahren wird oft jemand
 * anderes, und der Export ans Shuttle-Unternehmen soll ohne die Personentabelle
 * auskommen.
 */
export type ShuttleBooking = {
  id: string;
  passenger_name: string;
  passengers: number;
  driver_phone: string | null;
  pickup_at: string;
  pickup_location: string;
  pickup_address: string | null;
  dropoff_location: string;
  dropoff_address: string | null;
  latest_arrival_at: string | null;
  status: string;
  note: string | null;
  over_limit_reason: string | null;
  created_at: string;
};

/**
 * Ab wann eine Begründung nötig ist.
 *
 * Die Zahl steht auch in `request_shuttle`; hier dient sie nur dazu, das Feld
 * rechtzeitig einzublenden — entschieden wird in der Datenbank (Konrad, D8:
 * fünf Fahrten, darüber „Weitere Fahrt beantragen").
 */
export const SHUTTLE_LIMIT = 5;

/** Die Eingabefelder einer Fahrt, in der Reihenfolge des Formulars. */
export const SHUTTLE_FIELDS = [
  { key: "passenger_name", kind: "text", required: true },
  { key: "passengers", kind: "number", required: false },
  { key: "driver_phone", kind: "tel", required: false },
  { key: "pickup_at", kind: "datetime-local", required: true },
  { key: "pickup_location", kind: "text", required: true },
  { key: "pickup_address", kind: "text", required: false },
  { key: "dropoff_location", kind: "text", required: true },
  { key: "dropoff_address", kind: "text", required: false },
  { key: "latest_arrival_at", kind: "datetime-local", required: false },
] as const;

/** Eine Fahrt in Lead- und Admin-Sicht: wie oben, plus wer gefahren wird. */
export type ShuttleAdminRow = ShuttleBooking & {
  profile_id: string;
  speaker_first_name: string | null;
  speaker_last_name: string | null;
  booked_by_email: string | null;
  confirmed_at?: string | null;
};

/** Der Name des Speakers, wie ihn Listen zeigen. */
export function speakerName(row: {
  speaker_first_name: string | null;
  speaker_last_name: string | null;
}): string {
  return [row.speaker_first_name, row.speaker_last_name].filter(Boolean).join(" ") || "—";
}

/**
 * Die Spalten des Exports ans Shuttle-Unternehmen (ADM-028).
 *
 * **Eine Liste für CSV und Excel.** Zwei getrennte Definitionen laufen beim
 * ersten neuen Feld auseinander, und dann bekommt das Unternehmen je nach
 * Knopf eine andere Datei.
 *
 * Bewusst **nicht** dabei: interne Notizen, Begründungen für zusätzliche
 * Fahrten und die Mailadresse der anfordernden Person. Das Unternehmen fährt,
 * es verwaltet nicht — was es nicht braucht, geht es nichts an.
 */
export const SHUTTLE_EXPORT_COLUMNS: {
  key: string;
  label: string;
  width: number;
  value: (r: ShuttleAdminRow) => string | number;
}[] = [
  { key: "pickup_at", label: "Abholung", width: 18, value: (r) => zeit(r.pickup_at) },
  { key: "speaker", label: "Speaker", width: 24, value: (r) => speakerName(r) },
  { key: "passenger_name", label: "Beförderte Person", width: 24, value: (r) => r.passenger_name },
  { key: "passengers", label: "Personen", width: 10, value: (r) => r.passengers },
  { key: "driver_phone", label: "Telefon Fahrer", width: 18, value: (r) => r.driver_phone ?? "" },
  { key: "pickup_location", label: "Abholort", width: 24, value: (r) => r.pickup_location },
  { key: "pickup_address", label: "Adresse Abholung", width: 30, value: (r) => r.pickup_address ?? "" },
  { key: "dropoff_location", label: "Zielort", width: 24, value: (r) => r.dropoff_location },
  { key: "dropoff_address", label: "Adresse Ziel", width: 30, value: (r) => r.dropoff_address ?? "" },
  {
    key: "latest_arrival_at",
    label: "Spätestens da",
    width: 18,
    value: (r) => (r.latest_arrival_at ? zeit(r.latest_arrival_at) : ""),
  },
  { key: "status", label: "Stand", width: 12, value: (r) => r.status },
];

/**
 * Zeitpunkt in Hamburger Ortszeit, als `TT.MM.JJJJ HH:MM`.
 *
 * Nicht ISO und nicht die Zone des Servers: die Liste liest ein Disponent in
 * Hamburg, und eine Abholung um 07:30 muss dort auch 07:30 heissen.
 */
function zeit(wert: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(wert));
}
