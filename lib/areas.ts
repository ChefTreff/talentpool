/**
 * Bereiche des Portals (Masterplan §1). Ein Login, ein Umschalter —
 * sichtbar ist nur, wofür eine Rolle vorliegt (Masterplan §2 „Auth").
 *
 * Diese Datei ist bewusst frei von Server-Abhängigkeiten: `proxy.ts` (Login-Gate)
 * und `lib/auth.ts` (Rollenprüfung) teilen sie sich.
 */
export const AREA_KEYS = [
  "talent",
  "speaker",
  "speaker-leads",
  "partner",
  "volunteers",
  "hackathon",
  "produktion",
  "admin",
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
  /** Bereich steht dem Team offen — wer dazugehört, sagt SQL `is_staff()`. */
  staff?: boolean;
};

export const AREAS: readonly Area[] = [
  { key: "talent", path: "/profil", roles: [], leadRole: "area_lead_talent" },
  {
    key: "speaker",
    path: "/speaker",
    roles: ["speaker", "speaker_assistant"],
    leadRole: "area_lead_speaker",
  },
  {
    key: "speaker-leads",
    path: "/speaker-leads",
    roles: ["speaker_manager"],
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
  {
    key: "produktion",
    path: "/produktion",
    roles: ["production_team"],
    leadRole: "area_lead_production",
  },
  // Wer zum Team gehört, entscheidet ausschließlich `is_staff()` in SQL.
  { key: "admin", path: "/admin", roles: [], staff: true },
] as const;

/** Zu welchem Bereich gehört dieser Pfad? `null` = kein Bereich (öffentlich). */
export function areaForPath(pathname: string): Area | null {
  return (
    AREAS.find((a) => pathname === a.path || pathname.startsWith(`${a.path}/`)) ??
    null
  );
}

/** Öffnet dieses Rollenset den Bereich? `admin` global öffnet alles. */
export function canEnterArea(
  area: Area,
  roles: readonly string[],
  isStaff: boolean,
): boolean {
  if (roles.includes("admin")) return true;
  if (area.staff) return isStaff;
  if (area.leadRole && roles.includes(area.leadRole)) return true;
  if (area.roles.length === 0) return true; // Talent: jede eingeloggte Person
  return area.roles.some((r) => roles.includes(r));
}

/**
 * Die Bereiche, die dieser Person **gehören** — die Grundlage für Umschalter
 * und Einstieg.
 *
 * Das Teilnehmer-Portal steht jeder angemeldeten Person offen und wäre damit in
 * jeder Aufzählung dabei: eine Speakerin läse oben „Talent | Speaker", genau die
 * Spur anderer Bereiche, die weg soll (Feedback-Runde 1, Punkt 2; Konrads
 * Entscheidung 13.09.). Deshalb zählt es nur, wenn es der **einzige** Bereich
 * ist. Der **Zugang** bleibt davon unberührt: `canEnterArea` lässt weiter jede
 * angemeldete Person an `/profil` und `/programm`, und das Teilnehmer-Gerüst
 * trägt dort den Namen des eigenen Portals.
 */
export function areasFor(roles: readonly string[], isStaff: boolean): Area[] {
  const alle = AREAS.filter((a) => canEnterArea(a, roles, isStaff));
  const fach = alle.filter((a) => a.key !== "talent");
  return fach.length > 0 ? fach : alle;
}

/** Ziel nach dem Login, wenn `next` fehlt oder verworfen wurde. */
export const DEFAULT_AFTER_LOGIN = "/profil";

/**
 * Wohin nach dem Login, wenn kein Ziel mitkam: in den ersten eigenen Bereich
 * (Feedback-Runde 1, Punkt 2: „Login führt direkt in den einzigen Bereich").
 * Welche das sind, entscheidet `areasFor` — das Teilnehmer-Portal ist nur dabei,
 * wenn es das einzige ist.
 */
export function landingPathFor(areas: readonly Area[]): string {
  return areas[0]?.path ?? DEFAULT_AFTER_LOGIN;
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
