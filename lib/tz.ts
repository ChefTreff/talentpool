/**
 * Zeitrechnung in der Zeitzone des Events (`event.timezone`), nicht in der des
 * Browsers: Ein Board für Hamburg muss auch aus Lissabon dieselben Uhrzeiten
 * zeigen. Ohne Bibliothek — `Intl` kann alles Nötige.
 */

/** Verschiebung der Zone gegenüber UTC zu diesem Zeitpunkt, in Minuten. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return (asUtc - instant.getTime()) / 60_000;
}

/** Wanduhrzeit eines Zeitpunkts in der Zone, als Minuten seit Mitternacht. */
export function minutesOfDay(iso: string, timeZone: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/**
 * Wanduhrzeit → Zeitpunkt. Zweistufig, damit auch die Zeitumstellung stimmt:
 * der erste Versuch liefert den Offset, mit dem der zweite rechnet.
 */
export function zonedTimeToInstant(
  dayDate: string,
  minutes: number,
  timeZone: string,
): Date {
  const [year, month, day] = dayDate.split("-").map(Number);
  const naiveUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  const first = naiveUtc - zoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000;
  const second = naiveUtc - zoneOffsetMinutes(new Date(first), timeZone) * 60_000;
  return new Date(second);
}

/** „09:35" aus Minuten seit Mitternacht. */
export function formatMinutes(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** „09:35" aus einem Zeitpunkt, in der Zone des Events. */
export function formatTime(iso: string, timeZone: string): string {
  return formatMinutes(minutesOfDay(iso, timeZone));
}

/** „09:35 – 10:05" */
export function formatRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatTime(startIso, timeZone)} – ${formatTime(endIso, timeZone)}`;
}

/** „Fr., 16.04.2027" in der gewünschten Sprache. */
export function formatDay(dayDate: string, dateLocale: string): string {
  const [year, month, day] = dayDate.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, day));
}

/** Auf das 5-Minuten-Raster des Boards runden. */
export function snapTo5(minutes: number): number {
  return Math.round(minutes / 5) * 5;
}

/** „HH:MM" aus einem Feld → Minuten; `null` bei leer/ungültig. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
