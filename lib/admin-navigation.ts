import type { AdminSectionKey } from "@/lib/admin-sections";

/**
 * Die Seitenleiste des Admin-Bereichs — **eine** Liste für drei Leser (QS-032):
 * das Layout zeichnet sie für die angemeldete Person, die Rollenverwaltung
 * zeigt mit ihr, was eine Rolle sähe, und `tests/admin-navigation.test.ts`
 * hält sie deckungsgleich mit `lib/admin-sections.ts`.
 *
 * Sichtbarkeit und Zugang kommen aus derselben Quelle: jeder Punkt nennt den
 * Abschnitt, dessen Tor er öffnet. Eine Navigation, die auf etwas zeigt, das
 * hinterher 404 gibt, ist schlimmer als keine.
 *
 * **Sortiert nach Arbeitsbereich, nicht alphabetisch** (Feedback-Runde 1,
 * Punkt 7): wer die Speaker betreut, findet Tickets, Reisekosten, Hotels und
 * den Technik-Check beieinander. Die dritte Ebene bleibt **in** der Seite —
 * Partner, Volunteers und Produktion führen ihre Unterseiten als Reiter; die
 * Leiste nennt das Ziel, nicht jede Abzweigung.
 *
 * `label` ist ein Schlüssel in `t.admin.nav`, `gruppe` einer in
 * `t.admin.nav.sections` — leer heisst: Gruppe ohne Überschrift.
 */
export type NavPunkt = { section: AdminSectionKey; href: string; label: string };
export type NavGruppe = { gruppe: string; punkte: NavPunkt[] };

export const ADMIN_NAVIGATION: NavGruppe[] = [
  { gruppe: "", punkte: [{ section: "overview", href: "/admin", label: "overview" }] },
  {
    gruppe: "participants",
    punkte: [
      { section: "applications", href: "/admin/bewerbungen", label: "applications" },
      { section: "nextUp", href: "/admin/next-up", label: "nextUp" },
      { section: "communityEvents", href: "/admin/community-events", label: "communityEvents" },
    ],
  },
  // QS-032 (Konrad 22.09.): **Speaker und Programm** sind eine Gruppe. Das
  // Programm stand vorher unter „Teilnehmende" — die Rollen, die es öffnen
  // (`programme_team`, `area_lead_speaker`), arbeiten aber hier.
  {
    gruppe: "speakerProgramme",
    punkte: [
      // Der Einstieg in die Domäne steht oben: von hier aus geht es zu jedem
      // einzelnen Speaker, die Listen darunter beantworten Einzelfragen.
      { section: "speakers", href: "/admin/speaker", label: "speakers" },
      { section: "speakers", href: "/admin/speaker/aufgaben", label: "speakerTasks" },
      { section: "speakerLeads", href: "/admin/speaker-leads", label: "speakerLeads" },
      { section: "programme", href: "/admin/programm", label: "programme" },
      // Das Gerüst steht neben dem Programm: wer eine Bühne anlegt, kommt vom
      // Board und will dorthin zurück.
      { section: "edition", href: "/admin/edition", label: "edition" },
      { section: "submissions", href: "/admin/einreichungen", label: "submissions" },
      { section: "regie", href: "/admin/regie", label: "regie" },
      { section: "tech", href: "/admin/technik", label: "tech" },
      { section: "graphics", href: "/admin/grafiken", label: "graphics" },
      { section: "speakerTickets", href: "/admin/speaker-tickets", label: "speakerTickets" },
      { section: "expenses", href: "/admin/reisekosten", label: "expenses" },
      { section: "hospitality", href: "/admin/hospitality", label: "hospitality" },
      { section: "reception", href: "/admin/reception", label: "reception" },
      { section: "travel", href: "/admin/anreise", label: "travel" },
    ],
  },
  {
    gruppe: "partner",
    punkte: [
      { section: "partner", href: "/admin/partner", label: "partnerCare" },
      { section: "initiatives", href: "/admin/initiativen", label: "initiatives" },
      { section: "logoWall", href: "/admin/partner/logos", label: "logoWall" },
      { section: "companyTours", href: "/admin/company-tours", label: "companyTours" },
    ],
  },
  {
    gruppe: "volunteers",
    punkte: [
      { section: "volunteers", href: "/admin/volunteers", label: "volunteersWork" },
      { section: "checkin", href: "/admin/checkin", label: "checkin" },
    ],
  },
  // Produktion (PORT2): war bis zum 22.09.2026 ein eigenes Portal unter
  // `/produktion`. ADM-054: je ein Abschnitt, damit sich Rechte je Seite trennen lassen.
  {
    gruppe: "production",
    punkte: [
      { section: "production", href: "/admin/produktion", label: "productionRegie" },
      { section: "productionBooths", href: "/admin/produktion/staende", label: "productionBooths" },
      { section: "productionOrders", href: "/admin/produktion/bestellungen", label: "productionOrders" },
      { section: "productionFiles", href: "/admin/produktion/dateien", label: "productionFiles" },
    ],
  },
  // Catering betrifft Speaker **und** Volunteers; die Zahlen sind bewusst ohne
  // Personenbezug (Migration 0100).
  { gruppe: "crossCutting", punkte: [{ section: "catering", href: "/admin/catering", label: "catering" }] },
  // PORT4: Verwaltung — Personen, Zugänge, Rechte und das Protokoll, alle nur
  // für `admin`. Die Pfade bleiben, wo sie sind: ein Umzug bräche gemerkte
  // Adressen für einen reinen Navigationsgewinn.
  {
    gruppe: "administration",
    punkte: [
      { section: "persons", href: "/admin/personen", label: "persons" },
      // Das Team zuerst: „wer gehört dazu" ist die Frage, mit der man herkommt.
      { section: "team", href: "/admin/team", label: "team" },
      { section: "roles", href: "/admin/rollen", label: "roles" },
      { section: "duplicates", href: "/admin/dubletten", label: "duplicates" },
      { section: "deletions", href: "/admin/loeschantraege", label: "deletions" },
      { section: "access", href: "/admin/verwaltung/zugaenge", label: "access" },
      { section: "auditLog", href: "/admin/verwaltung/protokoll", label: "auditLog" },
    ],
  },
  {
    gruppe: "system",
    punkte: [
      { section: "deadlines", href: "/admin/fristen", label: "deadlines" },
      { section: "contacts", href: "/admin/ansprechpartner", label: "contacts" },
      { section: "vocab", href: "/admin/vokabular", label: "vocab" },
      { section: "questionCatalog", href: "/admin/fragenkatalog", label: "questionCatalog" },
      { section: "mail", href: "/admin/mail", label: "mail" },
      { section: "wiki", href: "/admin/wiki", label: "wiki" },
      { section: "videos", href: "/admin/videos", label: "videos" },
      { section: "ui", href: "/admin/ui", label: "ui" },
    ],
  },
];

/**
 * Die Leiste, wie sie jemand sieht, für den `offen` gilt. Eine Gruppe ohne
 * sichtbaren Punkt verschwindet mit — sonst stünde bei einem
 * Produktionsmitglied eine leere Überschrift „Speaker" in der Leiste.
 */
export function sichtbareNavigation(
  offen: (section: AdminSectionKey) => boolean,
  nav: Record<string, unknown>,
): { label: string; items: { href: string; label: string }[] }[] {
  const gruppen = (nav.sections ?? {}) as Record<string, string>;
  return ADMIN_NAVIGATION.map((g) => ({
    label: g.gruppe ? (gruppen[g.gruppe] ?? g.gruppe) : "",
    items: g.punkte
      .filter((p) => offen(p.section))
      .map((p) => ({ href: p.href, label: String(nav[p.label] ?? p.label) })),
  })).filter((g) => g.items.length > 0);
}
