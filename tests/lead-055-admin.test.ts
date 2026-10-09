import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { naechstePflichten } from "@/app/(speaker-leads)/speaker-leads/phase";
import { fensterEntwurf } from "@/app/(speaker-leads)/speaker-leads/entwurf";
import { verlaufStandVon, type VerlaufEintrag } from "@/lib/speaker/verlauf";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * LEAD-055 Teil 2: die Admin-Detailseite `/admin/speaker/[id]` mit demselben Kopf und denselben Blöcken wie das Personen-Fenster
 * der Leads (`docs/design-vorschlaege-2026-10-05.md`, „Die Admin-Detailseite“). Hier steht, was ohne Browser feststeht.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const DETAIL = "app/(admin)/admin/speaker/[id]/Detail.tsx";

const eintrag = (x: Partial<VerlaufEintrag>): VerlaufEintrag => ({
  id: "e",
  kind: "note",
  body: "Text",
  occurred_at: "2026-10-01T10:00:00Z",
  due_on: null,
  assignee_person_id: null,
  assignee_name: null,
  done_at: null,
  author_person_id: null,
  author_name: null,
  can_edit: true,
  can_complete: false,
  ...x,
});

describe("LEAD-055 Teil 2: der Stand des Verlaufs aus den Einträgen (wie `manager_speakers`)", () => {
  it("ohne Einträge: nichts offen, keine Aktivität", () => {
    assert.deepEqual(verlaufStandVon([]), { open_tasks: 0, next_task: null, last_activity_at: null });
  });

  it("offene Aufgaben zählen, die mit der frühesten Frist ist die nächste; Erledigte zählen nicht", () => {
    const stand = verlaufStandVon([
      eintrag({ id: "a", kind: "task", body: "Später", due_on: "2026-10-20", occurred_at: "2026-10-01T09:00:00Z" }),
      eintrag({ id: "b", kind: "task", body: "Zuerst", due_on: "2026-10-09", occurred_at: "2026-10-02T09:00:00Z", assignee_name: "Leo" }),
      eintrag({ id: "c", kind: "task", body: "Erledigt", due_on: "2026-10-01", done_at: "2026-10-03T09:00:00Z" }),
      eintrag({ id: "d", kind: "call", body: "Anruf" }),
    ]);
    assert.equal(stand.open_tasks, 2);
    assert.deepEqual(stand.next_task, { id: "b", body: "Zuerst", due_on: "2026-10-09", assignee_person_id: null, assignee_name: "Leo" });
  });

  it("bei gleicher Frist gewinnt die früher eingetragene Aufgabe", () => {
    const stand = verlaufStandVon([
      eintrag({ id: "spaet", kind: "task", due_on: "2026-10-09", occurred_at: "2026-10-03T10:00:00Z" }),
      eintrag({ id: "frueh", kind: "task", due_on: "2026-10-09", occurred_at: "2026-10-02T10:00:00Z" }),
    ]);
    assert.equal(stand.next_task?.id, "frueh");
  });

  it("die letzte Aktivität ist die späteste Zeit: bei einer Aufgabe wann sie erledigt wurde, sonst wann der Eintrag stand", () => {
    const stand = verlaufStandVon([
      eintrag({ kind: "note", occurred_at: "2026-10-02T10:00:00Z" }),
      eintrag({ kind: "task", due_on: "2026-10-09", occurred_at: "2026-10-04T10:00:00Z" }), // offen: zählt nicht
      eintrag({ kind: "task", due_on: "2026-10-01", occurred_at: "2026-09-30T10:00:00Z", done_at: "2026-10-03T08:00:00Z" }),
    ]);
    assert.equal(stand.last_activity_at, "2026-10-03T08:00:00.000Z");
  });
});

describe("LEAD-055 Teil 2: wenn der Partner alles verwaltet, gibt es keine Einladung", () => {
  const zeile = (x: Record<string, unknown> = {}) =>
    ({
      pipeline_status: "confirmed",
      stage_guest: false,
      invited_at: null,
      hospitality_status: "eligible",
      travel_costs_covered: false,
      travel_costs_approved: false,
      sessions: [{ session_id: "s1" }],
      ...x,
    }) as Parameters<typeof naechstePflichten>[0];

  it("ohne `mail_via` bleibt die Einladung eine offene Pflicht — die Liste der Leads kennt das Feld nicht", () => {
    assert.deepEqual(naechstePflichten(zeile()), ["invite"]);
  });

  it("mit `mail_via` entfällt sie: die Mails gehen an den Kontakt des Partners", () => {
    assert.deepEqual(naechstePflichten(zeile({ mail_via: { contact_id: "k1", name: "Pia", has_access: true } })), []);
    // auch wenn der Kontakt keinen Zugang mehr hat, bleibt der Partner der Weg — die Weiche stellt der Admin um
    assert.deepEqual(naechstePflichten(zeile({ mail_via: { contact_id: "k1", name: "Pia", has_access: false } })), []);
    assert.deepEqual(naechstePflichten(zeile({ mail_via: null })), ["invite"]);
  });
});

describe("LEAD-055 Teil 2: die Seite (Quelltext)", () => {
  const d = () => quelle(DETAIL);
  const seite = () => quelle("app/(admin)/admin/speaker/[id]/page.tsx");

  it("liest den Verlauf dazu und gibt ihn mit den Leads-Texten an die Ansicht — `speaker_detail()` trägt beides nicht", () => {
    const s = seite();
    assert.match(s, /supabase\.rpc\("speaker_activities", \{ p_profile_id: id \}\)/);
    assert.match(s, /verlaufStand=\{verlaufStandVon\(\(verlaufRows \?\? \[\]\) as VerlaufEintrag\[\]\)\}/);
    assert.match(s, /tl=\{t\.leads\}/);
    // das Tor bleibt, wie es war
    assert.match(s, /await requireAdminSection\("speakers", `\/admin\/speaker\/\$\{id\}`\)/);
  });

  it("sieben Blöcke als Karten in fester Reihenfolge: Grunddaten, Pipeline, Onboarding, Profil, Hospitality, Side Events (ADM-087), Programm", () => {
    const text = d();
    const ids = ["grunddaten", "pipeline", "onboarding", "profil", "hospitality", "side-events", "programm"];
    const stellen = ids.map((id) => text.indexOf(`<Block id="${id}"`) >= 0 ? text.indexOf(`<Block id="${id}"`) : text.indexOf(`id="${id}"\n`));
    assert.ok(stellen.every((s) => s > 0), "alle sieben Blöcke stehen auf der Seite");
    assert.deepEqual([...stellen].sort((a, b) => a - b), stellen, "die Reihenfolge ist fest");
    assert.equal((text.match(/<Block\b/g) ?? []).length, 7);
    assert.equal((text.match(/\bkarte\b\s+ebene="h2"/g) ?? []).length, 7, "Karten mit Überschrift der Ebene 2");
  });

  it("„Auf dieser Seite“ nennt dieselben sieben Blöcke — Anker und Block-Ids stehen an einer Stelle", () => {
    const text = d();
    const nav = text.slice(text.indexOf("<AbschnittsNavigation"), text.indexOf("</AbschnittsNavigation>") > 0 ? text.indexOf("</AbschnittsNavigation>") : text.indexOf("/>", text.indexOf("<AbschnittsNavigation")));
    for (const id of ["grunddaten", "pipeline", "onboarding", "profil", "hospitality", "side-events", "programm"]) {
      assert.match(nav, new RegExp(`\\{ id: "${id}", label:`), id);
    }
  });

  it("der Admin sieht in jedem Stand alle Blöcke (LEAD-054: „Admin sieht weiter alles“); nur die Pipeline ist vor der Zusage offen", () => {
    const text = d();
    assert.doesNotMatch(text, /\{nachZusage && \(\s+<Block/);
    assert.match(text, /<Block id="pipeline" karte ebene="h2" titel=\{tl\.blockPipeline\} kurz=\{kurzPipeline\} offen=\{!nachZusage\}>/);
  });

  it("der Kopf ist der gemeinsame Baustein, mit der Rolle des Teams und dem Recht, die Betreuung zu leeren", () => {
    const text = d();
    assert.match(text, /import \{ SpeakerKopf, type KopfErgebnis \} from "@\/components\/speaker\/SpeakerKopf";/);
    assert.match(text, /<SpeakerKopf[\s\S]*?\n\s+team\n\s+ownerOptionen=[\s\S]*?darfWeitergeben\n\s+ohneBetreuung/);
    assert.match(text, /blockPrefix=""/);
    assert.match(text, /boardPfad="\/admin\/programm"/);
    assert.match(text, /handover: \(personId\) => handoverSpeaker\(speaker\.id, personId\)/);
    assert.match(text, /approveTravel: \(\) => approveTravelCosts\(speaker\.id, true\)/);
  });

  it("die Einladung fragt vorher und nennt die Adresse; sie gibt es nie für Gäste und nie, wenn der Partner alles verwaltet", () => {
    const text = d();
    assert.match(text, /\{!speaker\.stage_guest && !speaker\.mail_via && \(/);
    assert.match(text, /body=\{speaker\.person\.email \? nenne\(tl\.inviteConfirmBody, \{ email: speaker\.person\.email \}\) : tl\.inviteConfirmBodyNoMail\}/);
    assert.match(text, /fuehreAus\(\(\) => inviteSpeaker\(speaker\.id\), tl\.invited\)/);
    assert.equal((text.match(/inviteSpeaker\(/g) ?? []).length, 1, "nur über die Rückfrage");
  });

  it("die Marken lesen wie im Fenster aus den Pflichten; Gäste tragen keine, nach einer Absage steht „Aufräumen“", () => {
    const text = d();
    assert.match(text, /const pflichten = naechstePflichten\(kopfSpeaker\);/);
    assert.match(text, /const marken = blockMarken\(pflichten\);/);
    assert.match(text, /if \(gast\) return undefined;/);
    assert.match(text, /if \(abgesagt\) return haengt\[b\] \? \{ text: tl\.markCleanup, ton: "warning" \} : undefined;/);
    assert.match(text, /const offenVon = \(b: PflichtBlock\) => !gast && !abgesagt && marken\[b\]\.zustand === "naechste";/);
    // die Reisekostenfreigabe des Admin ist `approved_at`; für die Pflichten zählt „freigegeben“
    assert.match(text, /travel_costs_approved: speaker\.travel_costs_approved_at !== null/);
  });

  it("der Anker `#verlauf` führt weiter hierher (Übersicht aller Verläufe): er steht im Block Pipeline", () => {
    const text = d();
    const pipeline = text.slice(text.indexOf('<Block id="pipeline"'), text.indexOf('<Block\n          id="onboarding"'));
    assert.match(pipeline, /<section id="verlauf" className="scroll-mt-20">/);
    assert.match(quelle("app/(admin)/admin/speaker/verlauf/VerlaufUebersicht.tsx"), /#verlauf/);
  });

  it("der Speichern-Balken klebt unten und erscheint nur bei Änderungen — ein Knopf ohne Aufgabe lädt zum Leerklicken ein", () => {
    const text = d();
    assert.match(text, /\{!unveraendert && \(\s+<div className="sticky bottom-0/);
    assert.match(text, /disabled=\{pending \|\| adresse\}/);
  });

  it("Admin-Vollständigkeit: jedes Feld des Fensters steht auch hier (Obermenge)", () => {
    const text = d();
    const felder = Object.keys(fensterEntwurf({
      speaker_type: "", job_title: null, organization_name: null, internal_notes: null, reception_eligible: false,
      travel_costs_covered: false, pass_type: "", lounge_access: false, hotel_tier: "", hospitality_status: "",
    } as unknown as ManagedSpeaker));
    for (const k of felder) assert.match(text, new RegExp(`\\b${k}: `), `draftVon: ${k}`);
    // Einordnung, Verlauf, Foto, Betreuung (im Kopf), Kontakte, Einwilligungen, Anreise, Sessions
    for (const baustein of ["<EinordnungFelder", "<Verlauf", "<PhotoUpload", "<KontakteCard", "<Einwilligungen", "<Abrechnungsart"]) {
      assert.ok(text.includes(baustein), baustein);
    }
    assert.match(text, /register=\{registerSpeakerPhotoAsAdmin\}/);
    assert.match(text, /shuttleStand\(speaker\.shuttle, t\)/);
    assert.match(text, /t\.consentGrantedByProxy : t\.consentNotGivenByProxy/);
  });

  it("das Foto im Admin ist wie im Fenster ein Abschnitt ohne eigene Karte (Karte in Karte steht auf der Verbotsliste)", () => {
    assert.match(d(), /<PhotoUpload[\s\S]*?variante="abschnitt"/);
  });

  it("alle Texte, die die Seite liest, stehen in DE und EN — `adminSpeaker` und `leads`", () => {
    const text = d();
    const eigene = [...new Set([...text.matchAll(/\bt\.([A-Za-z]\w*)/g)].map((m) => m[1]))].filter((k) => k !== "replace");
    const leads = [...new Set([...text.matchAll(/\btl\.([A-Za-z]\w*)/g)].map((m) => m[1]))].filter((k) => k !== "replace");
    assert.ok(eigene.length > 60 && leads.length > 15, "die Seite liest viele Texte");
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      assert.deepEqual(eigene.filter((k) => w.adminSpeaker[k] === undefined), [], `${sprache}.adminSpeaker: fehlende Texte`);
      assert.deepEqual(leads.filter((k) => w.leads[k] === undefined), [], `${sprache}.leads: fehlende Texte`);
    }
    // Dynamische Schlüssel: die Links und der Tech-Rider
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).adminSpeaker;
      for (const k of ["website", "x", "instagram"]) assert.ok(w[`social_${k}`], `${sprache}.social_${k}`);
      for (const k of ["own_laptop", "video"]) assert.ok(w[`rider_${k}`], `${sprache}.rider_${k}`);
    }
  });

  it("die Platzhalter der neuen Texte stehen in beiden Sprachen gleich", () => {
    const de = woerterbuch("de").adminSpeaker;
    const en = woerterbuch("en").adminSpeaker;
    const platz = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of ["shortBioMissing", "shortLinks"]) assert.equal(platz(de[k]), platz(en[k]), k);
    assert.equal(platz(de.shortBioMissing), "lang");
  });
});
