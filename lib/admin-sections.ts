/**
 * Welche Rolle öffnet welchen Abschnitt des Admin-Bereichs (PORT1, Konrad 22.09.2026).
 *
 * Seit „Admin zuerst" arbeiten **alle** Team-Funktionen unter `/admin`; das Gate
 * an der Tür (`requireArea("admin")`) lässt deshalb jede Teamrolle ein. Damit
 * daraus kein Freibrief wird, entscheidet **jeder Abschnitt** noch einmal selbst
 * — und zwar an einer Stelle, die Navigation und Seite sich teilen. Zwei
 * getrennte Listen für „was sehe ich" und „was darf ich" laufen auseinander;
 * diese Datei ist beides.
 *
 * Bewusst frei von Server-Abhängigkeiten, wie `lib/areas.ts`: die Navigation im
 * Layout, die Seiten-Gates und der Test lesen dieselbe Quelle.
 *
 * **Fail closed:** `roles: []` heisst „nur `admin`". Ein vergessener Abschnitt
 * ist damit zu eng statt zu weit — der Fehler, den man bemerkt, statt des
 * Fehlers, den niemand bemerkt.
 */

/**
 * Teamrollen, die den Admin-Bereich überhaupt öffnen. `admin` sieht alles.
 *
 * Konrads Modell (24.09.2026): **je Bereich eine Lead- und eine Team-Rolle**,
 * beide intern. Speaker und Programm sind **ein** Bereich (Lead
 * `area_lead_speaker`, Team `programme_team`); Partner hat eine eigene
 * Team-Rolle für Partner **und** Initiativen.
 *
 * **Nicht hier stehen die externen Rollen.** `speaker_manager` sind die
 * Bühnenleitungen von aussen — sie arbeiten in `/speaker-leads/*` und haben im
 * Admin nichts zu suchen; `volunteer_lead` führt Schichten im Volunteer-Portal;
 * `checkin_operator` ist ein Tablet am Eingang. Alle drei standen bis zum
 * 24.09.2026 in `team_role_keys()` der Datenbank und wären mit PORT1 zu
 * Teammitgliedern geworden.
 *
 * Muss mit `team_role_keys()` in der Datenbank übereinstimmen (Migration
 * `v6_rollenmodell_abschnitte`); `tests/admin-sections.test.ts` hält die Liste
 * gegen die dort genannten Rollen.
 */
export const TEAM_ROLES = [
  "admin",
  // Bereichsleitungen
  "area_lead_talent",
  "area_lead_speaker",
  "area_lead_partner",
  "area_lead_volunteers",
  "area_lead_hackathon",
  "area_lead_production",
  // Teams
  "talent_team",
  "programme_team",
  "partner_team",
  "volunteers_team",
  "hackathon_team",
  "production_team",
  "marketing_team",
] as const;

/** Rollen, die **ausserhalb** arbeiten und nie in den Admin gehören. */
export const EXTERNAL_ROLES = ["speaker_manager", "volunteer_lead", "checkin_operator"] as const;

export type AdminSectionKey =
  | "overview"
  | "applications"
  | "nextUp"
  | "communityEvents"
  | "programme"
  | "edition"
  | "speakers"
  | "speakerLeads"
  | "speakerTickets"
  | "expenses"
  | "hospitality"
  | "reception"
  | "travel"
  | "submissions"
  | "regie"
  | "tech"
  | "graphics"
  | "partner"
  | "initiatives"
  | "volunteers"
  | "catering"
  | "production"
  | "contacts"
  | "deadlines"
  | "wiki"
  | "videos"
  | "ui"
  | "vocab"
  | "mail"
  | "persons"
  | "team"
  | "roles"
  | "duplicates"
  | "deletions";

/** Alle Teamrollen ausser `admin` — für Abschnitte, die jede Rolle im Haus braucht. */
export const INTERNE_ROLLEN = [
  "area_lead_talent", "area_lead_speaker", "area_lead_partner",
  "area_lead_volunteers", "area_lead_hackathon", "area_lead_production",
  "talent_team", "programme_team", "partner_team",
  "volunteers_team", "hackathon_team", "production_team", "marketing_team",
] as const;

/** Die sechs Bereichsleitungen — Kurzform für Abschnitte, die jede angeht. */
export const AREA_LEADS = [
  "area_lead_talent", "area_lead_speaker", "area_lead_partner",
  "area_lead_volunteers", "area_lead_production", "area_lead_hackathon",
] as const;

export type AdminSection = {
  key: AdminSectionKey;
  /** Einstiegspfad; zugleich Präfix für die Zugehörigkeit einer URL. */
  path: string;
  /** Rollen **zusätzlich** zu `admin`. Leer = nur `admin` (Verwaltung). */
  roles: readonly string[];
};

/**
 * Die Zuordnung folgt der Arbeitsteilung, nicht der Technik: wer Speaker
 * betreut, braucht Tickets, Reisekosten, Hotels und den Technik-Check; wer die
 * Produktion führt, braucht Stände, Bestellungen und die Regie.
 *
 * Alles, was **Zugänge und Personen** betrifft, bleibt bei `admin` — das ist der
 * Bereich „Verwaltung" (PORT4): Personen, Team, Rollen, Dubletten,
 * Löschanträge. Ein Bereichslead soll seine Domäne führen, nicht Rechte
 * vergeben.
 */
export const ADMIN_SECTIONS: readonly AdminSection[] = [
  { key: "overview", path: "/admin", roles: TEAM_ROLES },

  // Teilnehmende und Programm
  { key: "applications", path: "/admin/bewerbungen", roles: ["area_lead_talent", "talent_team", "programme_team"] },
  // „Next Up" auf Home im Teilnehmer-Portal (TAL-006): ein Marketing-Kanal.
  // Dieselbe Rollenliste prüft `can_edit_next_up()` in SQL.
  { key: "nextUp", path: "/admin/next-up", roles: ["marketing_team", "area_lead_talent"] },
  // Community-Events aus Luma (TAL-008): Sicht, keine Pflege — gepflegt wird in
  // Luma. Dieselbe Rollenliste prüft `can_view_community_events()` in SQL.
  { key: "communityEvents", path: "/admin/community-events", roles: ["area_lead_talent", "talent_team", "marketing_team"] },
  { key: "programme", path: "/admin/programm", roles: ["programme_team", "area_lead_speaker", "area_lead_production"] },
  { key: "edition", path: "/admin/edition", roles: ["programme_team", "area_lead_production"] },

  // Speaker-Domäne
  { key: "speakers", path: "/admin/speaker", roles: ["area_lead_speaker", "programme_team"] },
  { key: "speakerLeads", path: "/admin/speaker-leads", roles: ["area_lead_speaker", "programme_team"] },
  { key: "speakerTickets", path: "/admin/speaker-tickets", roles: ["area_lead_speaker", "programme_team"] },
  { key: "expenses", path: "/admin/reisekosten", roles: ["area_lead_speaker", "programme_team"] },
  { key: "hospitality", path: "/admin/hospitality", roles: ["area_lead_speaker", "programme_team"] },
  { key: "reception", path: "/admin/reception", roles: ["area_lead_speaker", "programme_team"] },
  { key: "travel", path: "/admin/anreise", roles: ["area_lead_speaker", "programme_team", "area_lead_production", "production_team"] },
  { key: "submissions", path: "/admin/einreichungen", roles: ["area_lead_speaker", "programme_team"] },
  { key: "regie", path: "/admin/regie", roles: ["area_lead_production", "production_team", "programme_team"] },
  { key: "tech", path: "/admin/technik", roles: ["area_lead_production", "production_team", "area_lead_speaker"] },
  { key: "graphics", path: "/admin/grafiken", roles: ["marketing_team", "area_lead_speaker", "programme_team"] },

  // Partner
  { key: "partner", path: "/admin/partner", roles: ["area_lead_partner", "partner_team"] },
  { key: "initiatives", path: "/admin/initiativen", roles: ["area_lead_partner", "partner_team"] },

  // Volunteers
  { key: "volunteers", path: "/admin/volunteers", roles: ["area_lead_volunteers", "volunteers_team"] },

  // Quer
  { key: "catering", path: "/admin/catering", roles: ["area_lead_production", "production_team", "area_lead_volunteers", "volunteers_team", "area_lead_speaker", "programme_team"] },

  // Produktion (PORT2: war /produktion)
  { key: "production", path: "/admin/produktion", roles: ["production_team", "area_lead_production"] },

  // Werkzeuge, die jeder Bereich braucht — Leitung **und** Team. Ein Wiki, das
  // nur Bereichsleitungen pflegen dürfen, schreibt niemand.
  { key: "contacts", path: "/admin/ansprechpartner", roles: INTERNE_ROLLEN },
  { key: "deadlines", path: "/admin/fristen", roles: INTERNE_ROLLEN },
  { key: "wiki", path: "/admin/wiki", roles: INTERNE_ROLLEN },
  { key: "videos", path: "/admin/videos", roles: ["marketing_team", "area_lead_speaker", "programme_team"] },
  // Der Bausteinkatalog zeigt nur Beispiele, keine Daten.
  { key: "ui", path: "/admin/ui", roles: TEAM_ROLES },
  { key: "vocab", path: "/admin/vokabular", roles: [] },
  { key: "mail", path: "/admin/mail", roles: [] },

  // Verwaltung (PORT4): Personen, Zugänge, Rechte — nur Konrad
  { key: "persons", path: "/admin/personen", roles: [] },
  { key: "team", path: "/admin/team", roles: [] },
  { key: "roles", path: "/admin/rollen", roles: [] },
  { key: "duplicates", path: "/admin/dubletten", roles: [] },
  { key: "deletions", path: "/admin/loeschantraege", roles: [] },
];

const NACH_KEY = new Map(ADMIN_SECTIONS.map((s) => [s.key, s]));

export function adminSection(key: AdminSectionKey): AdminSection {
  const s = NACH_KEY.get(key);
  // Ein unbekannter Schlüssel ist ein Programmierfehler; er darf nicht in ein
  // offenes Gate münden.
  if (!s) throw new Error(`Unbekannter Admin-Abschnitt: ${key}`);
  return s;
}

/** Öffnet dieses Rollenset den Abschnitt? `admin` öffnet alles. */
export function canEnterAdminSection(key: AdminSectionKey, roles: readonly string[]): boolean {
  if (roles.includes("admin")) return true;
  return adminSection(key).roles.some((r) => roles.includes(r));
}

/** Darf diese Person den Admin-Bereich überhaupt betreten? */
export function isTeamMember(roles: readonly string[]): boolean {
  return TEAM_ROLES.some((r) => roles.includes(r));
}
