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

/** Teamrollen, die den Admin-Bereich überhaupt öffnen. `admin` sieht alles. */
export const TEAM_ROLES = [
  "admin",
  "production_team",
  "programme_team",
  "marketing_team",
  "speaker_manager",
  "area_lead_talent",
  "area_lead_speaker",
  "area_lead_partner",
  "area_lead_volunteers",
  "area_lead_hackathon",
  "area_lead_production",
] as const;

export type AdminSectionKey =
  | "overview"
  | "applications"
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
  { key: "applications", path: "/admin/bewerbungen", roles: ["area_lead_talent", "programme_team"] },
  { key: "programme", path: "/admin/programm", roles: ["programme_team", "area_lead_speaker", "area_lead_production"] },
  { key: "edition", path: "/admin/edition", roles: ["programme_team", "area_lead_production"] },

  // Speaker-Domäne
  { key: "speakers", path: "/admin/speaker", roles: ["area_lead_speaker", "speaker_manager", "programme_team"] },
  { key: "speakerLeads", path: "/admin/speaker-leads", roles: ["area_lead_speaker", "programme_team"] },
  { key: "speakerTickets", path: "/admin/speaker-tickets", roles: ["area_lead_speaker", "speaker_manager"] },
  { key: "expenses", path: "/admin/reisekosten", roles: ["area_lead_speaker", "speaker_manager"] },
  { key: "hospitality", path: "/admin/hospitality", roles: ["area_lead_speaker", "speaker_manager"] },
  { key: "reception", path: "/admin/reception", roles: ["area_lead_speaker", "speaker_manager"] },
  { key: "travel", path: "/admin/anreise", roles: ["area_lead_speaker", "speaker_manager", "area_lead_production"] },
  { key: "submissions", path: "/admin/einreichungen", roles: ["area_lead_speaker", "programme_team"] },
  { key: "regie", path: "/admin/regie", roles: ["area_lead_production", "production_team", "programme_team"] },
  { key: "tech", path: "/admin/technik", roles: ["area_lead_production", "production_team", "area_lead_speaker"] },
  { key: "graphics", path: "/admin/grafiken", roles: ["marketing_team", "area_lead_speaker"] },

  // Partner
  { key: "partner", path: "/admin/partner", roles: ["area_lead_partner"] },
  { key: "initiatives", path: "/admin/initiativen", roles: ["area_lead_partner"] },

  // Volunteers
  { key: "volunteers", path: "/admin/volunteers", roles: ["area_lead_volunteers"] },

  // Quer
  { key: "catering", path: "/admin/catering", roles: ["area_lead_production", "production_team", "area_lead_volunteers", "area_lead_speaker"] },

  // Produktion (PORT2: war /produktion)
  { key: "production", path: "/admin/produktion", roles: ["production_team", "area_lead_production"] },

  // Werkzeuge, die jeder Bereich braucht
  { key: "contacts", path: "/admin/ansprechpartner", roles: ["area_lead_speaker", "area_lead_partner", "area_lead_talent", "area_lead_volunteers", "area_lead_production", "area_lead_hackathon"] },
  { key: "deadlines", path: "/admin/fristen", roles: ["area_lead_speaker", "area_lead_partner", "area_lead_talent", "area_lead_volunteers", "area_lead_production", "area_lead_hackathon"] },
  { key: "wiki", path: "/admin/wiki", roles: ["area_lead_speaker", "area_lead_partner", "area_lead_talent", "area_lead_volunteers", "area_lead_production", "area_lead_hackathon", "marketing_team"] },
  { key: "videos", path: "/admin/videos", roles: ["marketing_team", "area_lead_speaker"] },
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
