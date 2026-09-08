/**
 * Bereiche des Portals (Masterplan §1). Ein Login, ein Umschalter —
 * sichtbar ist nur, wofür eine Rolle vorliegt (Masterplan §2 „Auth").
 *
 * Diese Datei ist bewusst frei von Server-Abhängigkeiten: `proxy.ts` (optimistischer
 * Redirect) und `lib/auth.ts` (echte Prüfung) teilen sie sich.
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
};

export const AREAS: readonly Area[] = [
  { key: "talent", path: "/profil", roles: [] },
  { key: "speaker", path: "/speaker", roles: ["speaker", "speaker_assistant"] },
  { key: "speaker-leads", path: "/speaker-leads", roles: ["speaker_manager"] },
  { key: "partner", path: "/partner", roles: ["partner_contact", "standbuehne_editor"] },
  { key: "volunteers", path: "/volunteers", roles: ["volunteer", "volunteer_lead"] },
  {
    key: "hackathon",
    path: "/hackathon",
    roles: ["hackathon_participant", "hackathon_partner"],
  },
  { key: "produktion", path: "/produktion", roles: ["production_team"] },
  {
    key: "admin",
    path: "/admin",
    roles: ["admin", "programme_team", "production_team"],
  },
] as const;

/** Bereichsleitung: `area_lead_<bereich>` mit `-` → `_` (Masterplan §4). */
export function areaLeadRole(key: AreaKey): string {
  return `area_lead_${key.replace(/-/g, "_")}`;
}

/** Zu welchem Bereich gehört dieser Pfad? `null` = kein Bereich (öffentlich). */
export function areaForPath(pathname: string): Area | null {
  return (
    AREAS.find(
      (a) => pathname === a.path || pathname.startsWith(`${a.path}/`),
    ) ?? null
  );
}

/**
 * Öffnet dieses Rollenset den Bereich?
 * `admin` global öffnet alles; `staff` hält den Alt-Zugang über `staff_user` offen.
 */
export function canEnterArea(
  area: Area,
  roles: readonly string[],
  isStaff: boolean,
): boolean {
  if (roles.includes("admin")) return true;
  if (area.roles.length === 0) return true; // Talent: jede eingeloggte Person
  if (area.key === "admin" && isStaff) return true;
  if (roles.includes(areaLeadRole(area.key))) return true;
  return area.roles.some((r) => roles.includes(r));
}

export function areasFor(roles: readonly string[], isStaff: boolean): Area[] {
  return AREAS.filter((a) => canEnterArea(a, roles, isStaff));
}
