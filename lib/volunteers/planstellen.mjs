/**
 * Planstellen 2026 → Schicht-Vorlagen 2027 (VOL-002, K-44 Frage 6). Reine Rechnung ohne
 * Datenbankzugriff, geteilt von `scripts/volunteer-vorlagen-import.mjs` und dem Test.
 *
 * Eingabe: die Zeilen aus `docs/import/volunteer-planstellen-2026.csv` (ohne Personen). Ausgabe:
 * Vorlagen je Bereich, Position (ohne laufende Nummer), ISO-Wochentag und Uhrzeit.
 * - Der Bereich ergibt sich aus dem Namenspräfix (2026 gab es kein Bereichsfeld).
 * - Positionen, die sich nur durch eine Endnummer unterscheiden („Construction Hero 3“), werden
 *   zu einer Position mit mehreren Plätzen — der Block hat die Kapazität, nicht die Zeile.
 * - Blöcke über 7 Stunden werden in 4–6-Stunden-Teile geteilt (K-44), Plätze je Teil unverändert.
 */

/** Reihenfolge zählt: der erste passende Eintrag gewinnt. Alles Übrige → `event_operations`. */
const BEREICHE = [
  [/^(akkreditierung|check-?in hero|personalisierung)/i, "accreditation"],
  [/^zutrittskontrolle/i, "access_control"],
  [/^construction/i, "construction"],
  [/^stage management/i, "stage_management"],
  [/^sustainability/i, "sustainability"],
  [/^(speakers?\s?care|speakerscare)/i, "speakers_care"],
  [/^(speakers?\s?lounge|speaker reception)/i, "speaker_lounge"],
  [/^cloakroom/i, "cloakroom"],
  [/^info point/i, "info_point"],
  [/^marketing/i, "marketing"],
  [/^masterclass/i, "masterclasses"],
  [/^hackathon/i, "hackathon"],
  [/^afterparty/i, "afterparty"],
  [/^production help/i, "production_help"],
  [/^event operations/i, "event_operations"],
];

export const FALLBACK_BEREICH = "event_operations";

/** `{ bereich, sicher }` — `sicher: false` heißt: kein Präfix passte, das Team prüft die Zuordnung. */
export function bereichFuer(position) {
  const name = String(position ?? "").trim();
  for (const [re, key] of BEREICHE) if (re.test(name)) return { bereich: key, sicher: true };
  return { bereich: FALLBACK_BEREICH, sicher: false };
}

/** „Construction Hero 3“ → „Construction Hero“; Namen mit Nummer in der Mitte bleiben. */
export function positionOhneNummer(position) {
  return String(position ?? "").trim().replace(/\s+\d+$/, "");
}

/** ISO-Wochentag (1 = Montag) eines `YYYY-MM-DD`-Datums. */
export function isoWochentag(datum) {
  const d = new Date(`${datum}T12:00:00Z`);
  const n = d.getUTCDay();
  return n === 0 ? 7 : n;
}

function minuten(zeit) {
  const [h, m] = String(zeit).split(":").map(Number);
  return h * 60 + (m || 0);
}

function hhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Teilt einen Block in Stücke von 4–6 Stunden; bis 7 Stunden bleibt er ganz (Warnung erst ab 8). */
export function teileBlock(beginn, ende) {
  const start = minuten(beginn);
  let stop = minuten(ende);
  if (stop <= start) stop += 1440;
  const laenge = stop - start;
  if (laenge <= 7 * 60) return [[hhmm(start), hhmm(stop)]];
  const teile = Math.ceil(laenge / (6 * 60));
  const stunden = Math.floor(laenge / 60);
  const basis = Math.floor(stunden / teile);
  const rest = stunden - basis * teile;
  const out = [];
  let cursor = start;
  for (let i = 0; i < teile; i++) {
    const dauer = (basis + (i < rest ? 1 : 0)) * 60;
    const naechster = i === teile - 1 ? stop : cursor + dauer;
    out.push([hhmm(cursor), hhmm(naechster)]);
    cursor = naechster;
  }
  return out;
}

/** CSV mit `;` (ohne Anführungszeichen) in Objekte. */
export function leseCsv(text) {
  const zeilen = String(text).replace(/^﻿/, "").split(/\r?\n/).filter((z) => z.trim() !== "");
  const kopf = zeilen[0].split(";").map((s) => s.trim());
  return zeilen.slice(1).map((z) => {
    const teile = z.split(";");
    return Object.fromEntries(kopf.map((k, i) => [k, (teile[i] ?? "").trim()]));
  });
}

/**
 * Aus den Planstellen die Vorlagen: gleiche (Bereich, Position, Wochentag, Beginn, Ende) werden
 * zusammengefasst und die Plätze addiert. Gibt `{ vorlagen, unsicher }` zurück; `unsicher` listet
 * die Positionsnamen ohne passenden Präfix.
 */
export function vorlagenAus(zeilen) {
  const map = new Map();
  const unsicher = new Set();
  for (const z of zeilen) {
    if (!z.Position || !z.Datum || !z.Beginn || !z.Ende) continue;
    const name = positionOhneNummer(z.Position);
    const { bereich, sicher } = bereichFuer(z.Position);
    if (!sicher) unsicher.add(name);
    const plaetze = Math.max(parseInt(z.Plaetze, 10) || 1, 1);
    const wochentag = isoWochentag(z.Datum);
    for (const [beginn, ende] of teileBlock(z.Beginn, z.Ende)) {
      const key = [bereich, name, wochentag, beginn, ende].join("|");
      const alt = map.get(key);
      if (alt) {
        alt.capacity += plaetze;
        if (!alt.briefing_md && z.Briefing) alt.briefing_md = z.Briefing;
      } else {
        map.set(key, {
          area: bereich,
          position: name,
          weekday: wochentag,
          start_time: beginn,
          end_time: ende,
          capacity: plaetze,
          briefing_md: z.Briefing || null,
        });
      }
    }
  }
  const vorlagen = [...map.values()].sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.weekday - b.weekday ||
      a.start_time.localeCompare(b.start_time) ||
      a.position.localeCompare(b.position),
  );
  return { vorlagen, unsicher: [...unsicher].sort() };
}
