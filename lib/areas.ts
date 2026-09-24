/**
 * Bereiche des Portals (Masterplan §1). Ein Login, ein Umschalter —
 * sichtbar ist nur, wofür eine Rolle vorliegt (Masterplan §2 „Auth").
 *
 * Diese Datei ist bewusst frei von Server-Abhängigkeiten: `proxy.ts` (Login-Gate)
 * und `lib/auth.ts` (Rollenprüfung) teilen sie sich.
 */
import { TEAM_ROLES } from "@/lib/admin-sections";

export const AREA_KEYS = [
  "talent",
  "speaker",
  "speaker-leads",
  "partner",
  "volunteers",
  "hackathon",
  "admin",
  "checkin",
] as const;

export type AreaKey = (typeof AREA_KEYS)[number];

export type Area = {
  key: AreaKey;
  /** Einstiegspfad; zugleich Präfix für die Zugehörigkeit einer URL. */
  path: string;
  /** Rollen, die den Bereich öffnen. Leer = jede eingeloggte Person. */
  roles: readonly string[];
  /**
   * Bereichsleitung laut Vokabular `role`. Explizit statt abgeleitet: die Keys
   * folgen nicht dem Bereichsnamen (`produktion` → `area_lead_production`,
   * Speaker-Leads teilen sich `area_lead_speaker`).
   */
  leadRole?: string;
};

export const AREAS: readonly Area[] = [
  // Seit 22.09.2026 die Menueseite statt des Profils (Konrad): wer sich
  // anmeldet, soll sehen, was es gibt, nicht in einem Formular landen.
  { key: "talent", path: "/start", roles: [], leadRole: "area_lead_talent" },
  {
    key: "speaker",
    path: "/speaker",
    roles: ["speaker", "speaker_assistant"],
    leadRole: "area_lead_speaker",
  },
  {
    // `programme_team` steht hier, weil es in den RPCs dahinter längst steht:
    // `manager_speakers`, `speaker_travel_list` und `speaker_managers` lassen
    // das Programm-Team durch, nur die Tür war zu. Ein Bereichsgate, das enger
    // ist als die Funktionen darin, ist kein Schutz — es ist ein Fehler, den
    // man erst merkt, wenn jemand vor der Tür steht (Konrad, 15.09.).
    key: "speaker-leads",
    path: "/speaker-leads",
    roles: ["speaker_manager", "programme_team"],
    leadRole: "area_lead_speaker",
  },
  {
    key: "partner",
    path: "/partner",
    roles: ["partner_contact", "standbuehne_editor"],
    leadRole: "area_lead_partner",
  },
  {
    key: "volunteers",
    path: "/volunteers",
    roles: ["volunteer", "volunteer_lead"],
    leadRole: "area_lead_volunteers",
  },
  {
    key: "hackathon",
    path: "/hackathon",
    roles: ["hackathon_participant", "hackathon_partner"],
    leadRole: "area_lead_hackathon",
  },
  // Seit „Admin zuerst" (Konrad, 22.09.2026) ist `/admin` der **einzige**
  // Einstieg fürs Team: das Produktionsportal ist hierher gezogen (PORT2), neue
  // Team-Funktionen entstehen gar nicht mehr woanders (PORT5). Die Tür lässt
  // deshalb jede Teamrolle ein — was jemand dahinter sieht, entscheidet
  // `lib/admin-sections.ts` je Abschnitt, und zwar für Navigation und Seite aus
  // derselben Quelle. Eine Tür, die enger ist als die Funktionen dahinter, wäre
  // kein Schutz, sondern ein zweites Portal durch die Hintertür.
  //
  // Die Rolle `admin` bleibt der Vollzugriff; in SQL heisst sie weiter
  // `is_staff()` (Migration 0107).
  { key: "admin", path: "/admin", roles: TEAM_ROLES.filter((r) => r !== "admin") },
  // Das Kiosk am Einlass. Eigener Bereich ohne Menü und ohne Umschalter — ein
  // Gerät im Vollbild am Eingang, sonst nichts (Arbeitsauftrag B4, E8).
  { key: "checkin", path: "/checkin", roles: ["checkin_operator"] },
] as const;

/** Zu welchem Bereich gehört dieser Pfad? `null` = kein Bereich (öffentlich). */
export function areaForPath(pathname: string): Area | null {
  return (
    AREAS.find((a) => pathname === a.path || pathname.startsWith(`${a.path}/`)) ??
    null
  );
}

/**
 * Ein Konto, das **nur** scannen darf.
 *
 * Das Kiosk-Konto ist ein Gerätekonto (E8), kein Mensch mit Profil. Ohne diese
 * Abfrage bekäme es über den Teilnehmer-Zweig von `canEnterArea` (Rollen leer =
 * jede angemeldete Person) das ganze Teilnehmer-Portal — auf einem Tablet, das
 * am Eingang offen herumsteht. Wer die Rolle **zusätzlich** hat (Team, das
 * aushilft), behält seine Bereiche.
 */
export function isKioskOnly(roles: readonly string[]): boolean {
  return roles.includes("checkin_operator") && roles.every((r) => r === "checkin_operator");
}

/**
 * Öffnet dieses Rollenset den Bereich? `admin` öffnet alles.
 *
 * Seit 0107 entscheiden ausschließlich Rollen. Vorher gab es daneben den Zweig
 * `area.staff` → `is_staff()`, also die Tabelle `staff_user` — zwei Begriffe
 * für dieselbe Frage, die auseinanderlaufen konnten. Der Parameter `isStaff`
 * ist damit weggefallen.
 */
export function canEnterArea(area: Area, roles: readonly string[]): boolean {
  if (roles.includes("admin")) return true;
  // Gerätekonto: genau ein Bereich, und der Teilnehmer-Zweig unten greift nicht.
  if (isKioskOnly(roles)) return area.key === "checkin";
  if (area.leadRole && roles.includes(area.leadRole)) return true;
  if (area.roles.length === 0) return true; // Talent: jede eingeloggte Person
  return area.roles.some((r) => roles.includes(r));
}

/**
 * Die Bereiche, die dieser Person **gehören** — die Grundlage für Auswahl und
 * Einstieg.
 *
 * Das Teilnehmer-Portal zählt wieder mit (Feedback-Runde 2, F8.7). In Runde 1
 * stand es nur da, wenn es der einzige Bereich war — damit eine Speakerin oben
 * nicht „Talent | Speaker" las. Konrad hat das am 14.09. zurückgenommen und
 * begründet: das Teilnehmer-Portal ist das Front-End des Talent-CRM und gilt
 * übergreifend für Teilnehmende des Summits und anderer Formate. Es ist also
 * ein eigenes Portal neben den anderen, keine Notlösung für Leute ohne Rolle.
 *
 * Seit 24.09.2026 (TAL-004) gilt das auch für die Shell: die Talent-Seiten
 * stehen nie mehr innerhalb eines Fachbereichs, sondern immer unter dem
 * eigenen Eintrag im Umschalter (`app/(talent)/layout.tsx`).
 *
 * Die Ausnahme bleibt das Gerätekonto am Einlass: `isKioskOnly` öffnet weiter
 * nur `/checkin` (E8, Architektur-Session 14.09.).
 */
export function areasFor(roles: readonly string[]): Area[] {
  return AREAS.filter((a) => canEnterArea(a, roles));
}

/** Ziel nach dem Login, wenn `next` fehlt oder verworfen wurde. */
export const DEFAULT_AFTER_LOGIN = "/start";

/**
 * Wohin nach dem Login, wenn kein Ziel mitkam (Feedback-Runde 1, Punkt 2:
 * „Login führt direkt in den einzigen Bereich"). Welche Bereiche zählen,
 * entscheidet `areasFor`; das Teilnehmer-Portal ist immer dabei, zählt für den
 * Einstieg aber erst, wenn es keinen Fachbereich gibt.
 *
 * Wer Admin hat, landet dort: für das Team ist das der Arbeitsplatz, und die
 * Reihenfolge in `AREAS` würde sonst nach Zufall entscheiden — Konrad hat
 * Speaker- und Partner-Testrollen und wäre im Speaker-Portal gelandet
 * (Entscheidung 13.09.). Sonst gilt der erste eigene Bereich.
 */
export function landingPathFor(areas: readonly Area[]): string {
  const admin = areas.find((a) => a.key === "admin");
  // Das Teilnehmer-Portal ist seit F8.7 immer dabei und steht in `AREAS` vorn.
  // Ohne diese Zeile landete jede Speakerin dort statt in ihrem Fachbereich —
  // die Sichtbarkeit hat sich geändert, der Einstieg nicht (Runde 1, Punkt 2).
  const fach = areas.find((a) => a.key !== "talent" && a.key !== "admin");
  return (admin ?? fach ?? areas[0])?.path ?? DEFAULT_AFTER_LOGIN;
}

/** Steuerzeichen fallen in Browsern beim URL-Parsen heraus — vorher verwerfen. */
function hasControlChars(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Nimmt aus `next` nur einen Pfad **auf diesem Host** an.
 *
 * Verworfen wird alles, was den Browser woanders hinschicken könnte:
 * absolute URLs (`https://evil.com`), protokoll-relative (`//evil.com`),
 * Backslash-Varianten (`/\evil.com`, die Browser wie `//` behandeln) und
 * userinfo-Tricks (`@evil.com`). Gültig ist genau: ein `/`, danach weder
 * `/` noch `\`.
 */
export function safeNextPath(
  next: string | null | undefined,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (typeof next !== "string" || next === "") return fallback;
  if (hasControlChars(next)) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

/** Login-Link mit Rücksprungziel — an genau einer Stelle gebaut. */
export function loginUrl(next?: string | null): string {
  const target = safeNextPath(next, "");
  return target ? `/login?next=${encodeURIComponent(target)}` : "/login";
}
