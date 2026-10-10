import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  betreuteJeLead,
  buehnenUebersicht,
  type BoardZeile,
  type LeadKopf,
  type SpeakerZeile,
} from "@/lib/speaker/leads-uebersicht";

/**
 * ADM-068 (Konrad 05.10.: „teilweise noch etwas unklar“): die Übersicht der Speaker-Leads unter `/admin/speaker-leads` beantwortet zwei Fragen getrennt — **wer leitet
 * welche Bühne** (Tabelle „Bühnen und Stage Leads“, eine Zeile je Bühne, auch die ohne Stage Lead) und **wen betreut wer** (je Lead-Person die Speaker zum Aufklappen).
 * Keine Datenbankänderung: gelesen wird `manager_speakers` und die Sicht `programme_board`. Die Zusammensetzung steht in `lib/speaker/leads-uebersicht.ts` und wird hier
 * ausgeführt; die Seite und die Ansicht werden am Quelltext geprüft.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const SEITE = "app/(admin)/admin/speaker-leads/page.tsx";
const ANSICHT = "app/(admin)/admin/speaker-leads/LeadsView.tsx";
const KEIN_NAME = "—";

const rolle = (role: string, scope_type: string, scope_id: string | null, id = `${role}-${scope_type}-${scope_id}`) => ({ id, role, scope_type, scope_id });
const lead = (person_id: string, display_name: string | null, assignments: LeadKopf["assignments"], email: string | null = null): LeadKopf => ({
  person_id,
  display_name,
  email,
  assignments,
});
const slot = (stage_id: string, session_id: string | null, speakers: { person_id: string; role?: string | null }[] | null): BoardZeile => ({ stage_id, session_id, speakers });
const speaker = (id: string, nachname: string | null, vorname: string | null, extra: Partial<SpeakerZeile> = {}): SpeakerZeile => ({
  id,
  first_name: vorname,
  last_name: nachname,
  owner_person_id: "p1",
  pipeline_status: "confirmed",
  confirmed_at: null,
  declined_at: null,
  next_open: [],
  stage_guest: false,
  ...extra,
});

const BUEHNEN = [
  { id: "s1", name: "Main Stage" },
  { id: "s2", name: "Future Stage" },
  { id: "s3", name: "Masterclass-Raum" },
];

describe("ADM-068: buehnenUebersicht — wer leitet welche Bühne", () => {
  it("eine Zeile je Bühne in der Reihenfolge, in der sie kommt; eine Bühne ohne Stage Lead steht mit leerer Liste da", () => {
    const zeilen = buehnenUebersicht(BUEHNEN, [lead("p1", "Konrad Gruner", [rolle("speaker_manager", "stage", "s1")])], [], KEIN_NAME);
    assert.deepEqual(zeilen.map((z) => z.stage_id), ["s1", "s2", "s3"]);
    assert.deepEqual(zeilen.map((z) => z.name), ["Main Stage", "Future Stage", "Masterclass-Raum"]);
    assert.deepEqual(zeilen[0].leads, [{ person_id: "p1", name: "Konrad Gruner" }]);
    assert.deepEqual(zeilen[1].leads, []);
    assert.deepEqual(zeilen[2].leads, []);
  });

  it("ohne Bühnen keine Zeilen", () => {
    assert.deepEqual(buehnenUebersicht([], [lead("p1", "Konrad Gruner", [rolle("speaker_manager", "stage", "s1")])], [], KEIN_NAME), []);
  });

  it("nur `speaker_manager` mit der Bühne als Bereich leitet die Bühne: Leitung Speaker, Tages- und Slot-Bereich und die Bühne einer anderen Person gehören nicht dazu", () => {
    const leads = [
      lead("p1", "Konrad Gruner", [rolle("speaker_manager", "stage", "s1")]),
      lead("p2", "Paulina Zehle", [rolle("area_lead_speaker", "edition", null)]),
      lead("p3", "Tagesleitung", [rolle("speaker_manager", "stage_day", "s1")]),
      lead("p4", "Slotleitung", [rolle("speaker_manager", "slot", "s1")]),
      lead("p5", "Andere Bühne", [rolle("speaker_manager", "stage", "s2")]),
      // dieselbe Bereichs-Kennung, aber eine andere Rolle: keine Bühnenleitung
      lead("p6", "Falsche Rolle", [rolle("area_lead_speaker", "stage", "s1")]),
    ];
    const zeilen = buehnenUebersicht(BUEHNEN, leads, [], KEIN_NAME);
    assert.deepEqual(zeilen[0].leads.map((l) => l.person_id), ["p1"]);
    assert.deepEqual(zeilen[1].leads.map((l) => l.person_id), ["p5"]);
    assert.deepEqual(zeilen[2].leads, []);
  });

  it("mehrere Stage Leads einer Bühne stehen alphabetisch; wer zwei Bühnen leitet, steht in beiden Zeilen", () => {
    const leads = [
      lead("p2", "Leo Leiter", [rolle("speaker_manager", "stage", "s3")]),
      lead("p1", "Konrad Gruner", [rolle("speaker_manager", "stage", "s1"), rolle("speaker_manager", "stage", "s3")]),
      lead("p3", "Åsa Ärmel", [rolle("speaker_manager", "stage", "s3")]),
    ];
    const zeilen = buehnenUebersicht(BUEHNEN, leads, [], KEIN_NAME);
    assert.deepEqual(zeilen[2].leads.map((l) => l.name), ["Åsa Ärmel", "Konrad Gruner", "Leo Leiter"]);
    assert.deepEqual(zeilen[0].leads.map((l) => l.name), ["Konrad Gruner"]);
  });

  it("der Name fällt auf die E-Mail-Adresse und dann auf den Platzhalter zurück", () => {
    const leads = [
      lead("p1", null, [rolle("speaker_manager", "stage", "s1")], "ohne-name@example.org"),
      lead("p2", null, [rolle("speaker_manager", "stage", "s2")], null),
    ];
    const zeilen = buehnenUebersicht(BUEHNEN, leads, [], KEIN_NAME);
    assert.equal(zeilen[0].leads[0].name, "ohne-name@example.org");
    assert.equal(zeilen[1].leads[0].name, KEIN_NAME);
  });

  it("Sessions: je Session einmal, auch wenn sie mehrere Slots belegt; ein Slot ohne Session zählt nicht; Slots anderer Bühnen zählen nicht", () => {
    const board = [
      slot("s1", "e1", []),
      slot("s1", "e1", []),
      slot("s1", "e2", []),
      slot("s1", null, []),
      slot("s3", "e3", []),
    ];
    const zeilen = buehnenUebersicht(BUEHNEN, [], board, KEIN_NAME);
    assert.deepEqual(zeilen.map((z) => z.sessions), [2, 0, 1]);
  });

  it("Speaker: verschiedene Personen, die auf Sessions der Bühne stehen — wer zweimal auftritt, zählt einmal, die Moderation zählt nicht, ein Slot ohne Session zählt nicht", () => {
    const board = [
      slot("s1", "e1", [{ person_id: "x1", role: "speaker" }, { person_id: "m1", role: "moderator" }]),
      slot("s1", "e2", [{ person_id: "x2", role: "speaker" }, { person_id: "x1", role: "speaker" }]),
      // Besetzung ohne Rolle (Panel, Keynote …) zählt wie ein Speaker
      slot("s1", "e4", [{ person_id: "x3" }, { person_id: "x4", role: null }]),
      // ein freier Slot hat keine Session und keine Besetzung
      slot("s1", null, [{ person_id: "x9", role: "speaker" }]),
      // dieselbe Person auf einer anderen Bühne zählt dort, nicht hier
      slot("s3", "e3", [{ person_id: "x1", role: "speaker" }]),
    ];
    const zeilen = buehnenUebersicht(BUEHNEN, [], board, KEIN_NAME);
    assert.equal(zeilen[0].speakers, 4, "x1, x2, x3, x4");
    assert.equal(zeilen[1].speakers, 0);
    assert.equal(zeilen[2].speakers, 1);
  });

  it("eine Besetzung `null` (Sicht ohne Speaker) bricht die Zählung nicht", () => {
    const zeilen = buehnenUebersicht(BUEHNEN, [], [slot("s1", "e1", null)], KEIN_NAME);
    assert.deepEqual([zeilen[0].sessions, zeilen[0].speakers], [1, 0]);
  });

  it("die Eingaben bleiben unverändert", () => {
    const leads = [lead("p2", "Zoe", [rolle("speaker_manager", "stage", "s1")]), lead("p1", "Abel", [rolle("speaker_manager", "stage", "s1")])];
    const vorher = JSON.stringify([BUEHNEN, leads]);
    buehnenUebersicht(BUEHNEN, leads, [], KEIN_NAME);
    assert.equal(JSON.stringify([BUEHNEN, leads]), vorher);
  });
});

describe("ADM-068: betreuteJeLead — wen betreut wer", () => {
  it("gruppiert nach der Person, der die Speaker zugeordnet sind, und sortiert nach Nachname und Vorname", () => {
    const zeilen = [
      speaker("a", "Muster", "Ben"),
      speaker("b", "Beispiel", "Anna"),
      speaker("c", "Muster", "Anke"),
      speaker("d", "Partner", "Dora", { owner_person_id: "p2" }),
    ];
    const aus = betreuteJeLead(zeilen, KEIN_NAME);
    assert.deepEqual(Object.keys(aus).sort(), ["p1", "p2"]);
    assert.deepEqual(aus.p1.map((s) => s.name), ["Anna Beispiel", "Anke Muster", "Ben Muster"]);
    assert.deepEqual(aus.p2.map((s) => s.profile_id), ["d"]);
  });

  it("Speaker ohne Betreuung (sie stehen oben unter „Ohne Betreuung“) und Gäste der Partner (SPK-070) stehen in keiner Liste", () => {
    const aus = betreuteJeLead(
      [speaker("a", "Frei", "Frida", { owner_person_id: null }), speaker("b", "Gast", "Gerd", { stage_guest: true }), speaker("c", "Echt", "Eva")],
      KEIN_NAME,
    );
    assert.deepEqual(Object.keys(aus), ["p1"]);
    assert.deepEqual(aus.p1.map((s) => s.profile_id), ["c"]);
  });

  it("zugesagt, abgesagt und offene Schritte zählen wie in `speaker_leads_admin`: zugesagt nur mit Zusage und ohne Absage, abgesagt mit Absage, offen = Länge der offenen Schritte", () => {
    const aus = betreuteJeLead(
      [
        speaker("a", "A", "A", { confirmed_at: "2027-01-01T00:00:00Z", next_open: [{}, {}, {}] }),
        speaker("b", "B", "B", { confirmed_at: "2027-01-01T00:00:00Z", declined_at: "2027-02-01T00:00:00Z" }),
        speaker("c", "C", "C", { declined_at: "2027-02-01T00:00:00Z", pipeline_status: "declined" }),
        speaker("d", "D", "D", { pipeline_status: "lead", next_open: null }),
      ],
      KEIN_NAME,
    );
    const nach = Object.fromEntries(aus.p1.map((s) => [s.profile_id, s]));
    assert.deepEqual([nach.a.zugesagt, nach.a.abgesagt, nach.a.offen], [true, false, 3]);
    assert.deepEqual([nach.b.zugesagt, nach.b.abgesagt], [false, true], "zugesagt und später abgesagt: zählt als abgesagt");
    assert.deepEqual([nach.c.zugesagt, nach.c.abgesagt], [false, true]);
    assert.deepEqual([nach.d.zugesagt, nach.d.abgesagt, nach.d.offen], [false, false, 0]);
    assert.equal(nach.a.pipeline_status, "confirmed");
    assert.equal(nach.d.pipeline_status, "lead");
  });

  it("der Name setzt sich aus Vor- und Nachname zusammen; fehlen beide, steht der Platzhalter da", () => {
    const aus = betreuteJeLead([speaker("a", null, "Nur Vorname"), speaker("b", "Nur Nachname", null), speaker("c", null, null)], KEIN_NAME);
    assert.deepEqual(aus.p1.map((s) => s.name).sort(), [KEIN_NAME, "Nur Nachname", "Nur Vorname"].sort());
  });

  it("die Eingabe bleibt unverändert (sortiert wird eine Kopie)", () => {
    const zeilen = [speaker("a", "Zeta", "Z"), speaker("b", "Alpha", "A")];
    betreuteJeLead(zeilen, KEIN_NAME);
    assert.deepEqual(zeilen.map((s) => s.id), ["a", "b"]);
  });

  it("die Zählregeln stimmen mit der Datenbankfunktion überein, deren Zahl „Betreut“ diese Liste auflöst: ohne Gäste, je Edition", () => {
    const fn = quelle("supabase/snapshot/functions/speaker_leads_admin.sql");
    assert.ok((fn.match(/not sp\.stage_guest/g) ?? []).length >= 4, "alle vier Zahlen schließen Gäste aus");
    assert.match(fn, /sp\.confirmed_at is not null and sp\.declined_at is null/);
    assert.match(fn, /sp\.declined_at is not null/);
    assert.match(fn, /jsonb_array_length\(speaker_next_steps\(sp\.id\)->'open'\)/);
  });
});

describe("ADM-068: die Seite liest, was es gibt — keine Datenbankänderung", () => {
  const seite = quelle(SEITE);

  it("der Zugang bleibt der Admin-Abschnitt `speakerLeads`", () => {
    assert.match(seite, /requireAdminSection\("speakerLeads", "\/admin\/speaker-leads"\)/);
  });

  it("die Daten kommen aus `manager_speakers` (alle Speaker der Edition mit der Person, die sie betreut) und der Sicht `programme_board` (Slots und Sessions des Summit)", () => {
    assert.match(seite, /supabase\.rpc\("manager_speakers", \{ p_edition_id: edition\.id \}\)/);
    assert.match(seite, /\.from\("programme_board"\)\s*\.select\("stage_id, session_id, speakers"\)\s*\.in\("event_id", events\.map\(\(e\) => e\.id\)\)/);
  });

  it("nur aktive Bühnen des Summit zählen — dieselbe Auswahl wie im Formular „Lead-Person aufnehmen“, geordnet nach `sort_order`", () => {
    assert.match(seite, /\.from\("stage"\)\.select\("id, name"\)\.in\("event_id", events\.map\(\(e\) => e\.id\)\)\.eq\("active", true\)\.order\("sort_order"\)/);
  });

  it("die Seite setzt beide Listen mit den Helfern zusammen und reicht sie der Ansicht", () => {
    assert.match(seite, /buehnenUebersicht\(stages, \(leads \?\? \[\]\) as LeadRow\[\], \(boardRows \?\? \[\]\) as BoardZeile\[\], keinName\)/);
    assert.match(seite, /betreuteJeLead\(\(speakerRows \?\? \[\]\) as SpeakerZeile\[\], keinName\)/);
    assert.match(seite, /buehnen=\{buehnen\}/);
    assert.match(seite, /betreute=\{betreute\}/);
  });

  it("ohne Bühnen des Summit entfällt die Abfrage des Boards (kein `in ()` über eine leere Liste)", () => {
    assert.equal((seite.match(/events\.length > 0\s*\?/g) ?? []).length, 2, "die Bühnen und das Board: je eine Bedingung");
  });

  it("die Seitenleiste bleibt, wie sie ist: ein Eintrag „Speaker-Leads“, kein neuer Menüpunkt (die Admin-Struktur K-95 steht aus)", () => {
    const nav = quelle("lib/admin-navigation.ts");
    assert.equal((nav.match(/href: "\/admin\/speaker-leads"/g) ?? []).length, 1);
    assert.match(nav, /\{ section: "speakerLeads", href: "\/admin\/speaker-leads", label: "speakerLeads" \},/);
  });
});

describe("ADM-068: die Ansicht", () => {
  const ansicht = quelle(ANSICHT);

  it("die Bühnen-Tabelle steht zwischen den unbetreuten Speakern und der Lead-Tabelle, mit Überschrift und Satz davor", () => {
    const unbetreut = ansicht.indexOf("{t.unassignedTitle}");
    const buehnen = ansicht.indexOf("{t.stagesTitle}");
    const personen = ansicht.indexOf("{t.leadsTitle}");
    const aufnehmen = ansicht.indexOf('id="lead-aufnehmen"');
    assert.ok(unbetreut > 0 && buehnen > unbetreut && personen > buehnen && aufnehmen > personen, "Reihenfolge: Ohne Betreuung, Bühnen, Lead-Personen, Aufnehmen");
    assert.match(ansicht, /<h2 className="ct-h2 text-ink">\{t\.stagesTitle\}<\/h2>\s*<p className="ct-help mb-3 mt-1 max-w-text">\{t\.stagesHint\}<\/p>/);
  });

  it("je Bühne: Name, die Stage Leads als Links zur Person, Sessions und Speaker als Zahlen; die Tabelle stapelt sich auf dem Handy", () => {
    const von = ansicht.indexOf("<Table stapeln>");
    assert.ok(von > 0, "die Bühnen-Tabelle stapelt sich");
    // nur die Bühnen-Tabelle: der Link zur Person steht auch in der Lead-Tabelle darunter
    const tabelle = ansicht.slice(von, ansicht.indexOf("</Table>", von));
    assert.match(tabelle, /^<Table stapeln>\s*<Thead>\s*<Th>\{t\.colStage\}<\/Th>\s*<Th>\{t\.colStageLeads\}<\/Th>\s*<Th numeric>\{t\.colSessions\}<\/Th>\s*<Th numeric>\{t\.colStageSpeakers\}<\/Th>/);
    assert.match(tabelle, /\{b\.leads\.map\(\(l\) => \(\s*<Link key=\{l\.person_id\} href=\{`\/admin\/personen\/\$\{l\.person_id\}`\} className="ct-link">\s*\{l\.name\}\s*<\/Link>/);
    assert.match(tabelle, /<Td numeric label=\{t\.colSessions\}>\s*\{b\.sessions\}\s*<\/Td>/);
    assert.match(tabelle, /<Td numeric label=\{t\.colStageSpeakers\}>\s*\{b\.speakers\}\s*<\/Td>/);
  });

  it("eine Bühne ohne Stage Lead trägt die Marke „Noch keine Stage Lead“ — als Text in einer Warnmarke, nicht nur als Farbe", () => {
    assert.match(ansicht, /b\.leads\.length === 0 \? \(\s*<Badge tone="warning">\{t\.noStageLead\}<\/Badge>/);
  });

  it("„Aufnehmen“ springt zum Formular mit der Bühne schon gewählt und der Suche im Fokus; der Knopf nennt die Bühne für Screenreader", () => {
    assert.match(ansicht, /function buehneWaehlen\(id: string\) \{\s*setBuehne\(id\);\s*document\.getElementById\("lead-aufnehmen"\)\?\.scrollIntoView\(\);\s*document\.getElementById\("q"\)\?\.focus\(\);\s*\}/);
    assert.match(ansicht, /<Card id="lead-aufnehmen">/);
    assert.match(ansicht, /id="q"/, "das Suchfeld, das der Fokus trifft");
    assert.match(ansicht, /aria-label=\{`\$\{t\.addStageLead\}: \$\{b\.name\}`\}/);
    assert.match(ansicht, /onClick=\{\(\) => buehneWaehlen\(b\.stage_id\)\}/);
  });

  it("gibt es keine Bühne, steht ein Leerzustand mit einem Satz Erklärung statt einer leeren Tabelle", () => {
    assert.match(ansicht, /buehnen\.length === 0 \? \(\s*<EmptyState title=\{t\.noStagesTitle\} description=\{t\.noStagesBody\} \/>/);
  });

  it("je Lead-Person klappt „Betreute Speaker (n)“ die Speaker auf: Name als Link zum Speaker-Detail, Stand der Pipeline, offene Schritte — nur, wenn jemand betreut wird", () => {
    assert.match(ansicht, /\(betreute\[l\.person_id\] \?\? \[\]\)\.length > 0 && \(\s*<details className="mt-1">/);
    // nur der aufklappbare Block: den Link zum Speaker-Detail gibt es auch in der Liste „Ohne Betreuung“
    const von = ansicht.indexOf('<details className="mt-1">');
    const block = ansicht.slice(von, ansicht.indexOf("</details>", von));
    assert.match(block, /t\.showSpeakers\.replace\("\{n\}", String\(betreute\[l\.person_id\]\.length\)\)/);
    assert.match(block, /<Link href=\{`\/admin\/speaker\/\$\{s\.profile_id\}`\} className="ct-link ct-small">\s*\{s\.name\}\s*<\/Link>/);
    assert.match(block, /labels\.pipeline\[s\.pipeline_status\] \?\? s\.pipeline_status/);
    assert.match(block, /s\.offen > 0 && <span className="ct-help">\{t\.openStepsOne\.replace\("\{n\}", String\(s\.offen\)\)\}<\/span>/);
  });

  it("die Zusage zeigt sich als Text und als Farbe: die Marke trägt den Stand der Pipeline, grün nur bei Zusage", () => {
    assert.match(ansicht, /<Badge tone=\{s\.zugesagt \? "success" : "neutral"\}>/);
  });

  it("das Aufklappen ist mit Touch bedienbar (Trefferfläche ≥ 44 px) und bricht nicht um", () => {
    assert.match(ansicht, /<summary className="ct-help cursor-pointer whitespace-nowrap font-semibold pointer-coarse:-my-3 pointer-coarse:py-3">/);
  });

  it("die bestehenden Wege bleiben: Zuordnen am Stück, Rolle entziehen mit Rückfrage, Aufnehmen je Bühne", () => {
    for (const aufruf of ["assignSpeaker", "findPeople", "revokeLead"]) assert.ok(ansicht.includes(aufruf), aufruf);
    assert.match(ansicht, /<ConfirmDialog/);
    assert.match(ansicht, /entziehen\.speakers > 0/);
  });
});

describe("ADM-068: Texte", () => {
  type Bereich = Record<string, string>;
  const de = (JSON.parse(quelle("lib/i18n/de.json")) as { adminSpeakerLeads: Bereich }).adminSpeakerLeads;
  const en = (JSON.parse(quelle("lib/i18n/en.json")) as { adminSpeakerLeads: Bereich }).adminSpeakerLeads;
  const NEU = [
    "stagesTitle",
    "stagesHint",
    "noStagesTitle",
    "noStagesBody",
    "colStage",
    "colStageLeads",
    "colSessions",
    "colStageSpeakers",
    "colAction",
    "noStageLead",
    "addStageLead",
    "showSpeakers",
    "openStepsOne",
  ];

  it("jeder neue Schlüssel steht in DE und EN und ist nicht leer", () => {
    for (const k of NEU) {
      assert.ok(de[k]?.trim(), `de.${k}`);
      assert.ok(en[k]?.trim(), `en.${k}`);
    }
  });

  it("jeder Schlüssel, den die Ansicht neu liest, gibt es", () => {
    const ansicht = quelle(ANSICHT);
    for (const k of NEU) assert.ok(ansicht.includes(`t.${k}`), `die Ansicht liest t.${k}`);
  });

  it("die Platzhalter {n} stehen in beiden Sprachen an der richtigen Stelle", () => {
    for (const k of ["showSpeakers", "openStepsOne"]) {
      assert.match(de[k], /\{n\}/, `de.${k}`);
      assert.match(en[k], /\{n\}/, `en.${k}`);
    }
  });

  it("der Satz unter dem Titel nennt beide Fragen: wer leitet welche Bühne, wen betreut wer", () => {
    assert.match(de.lead, /Bühne/);
    assert.match(de.lead, /betreut/);
    assert.match(en.lead, /stage/);
    assert.match(en.lead, /looks after/);
  });

  it("der Satz unter der Bühnen-Tabelle sagt, was eine Bühne ohne Stage Lead bedeutet", () => {
    assert.match(de.stagesHint, /ohne Stage Lead/);
    assert.match(en.stagesHint, /without a stage lead/);
  });
});

describe("ADM-068: Doku", () => {
  it("Testleitfaden: eine Zeile zu `/admin/speaker-leads` nennt die Abschnitte von oben nach unten, den Sprung von der Bühne und das Aufklappen der Speaker", () => {
    const zeile = quelle("docs/team-testleitfaden.md").split("\n").find((l) => l.startsWith("| `/admin/speaker-leads` Speaker-Leads"));
    assert.ok(zeile, "Zeile fehlt");
    assert.match(zeile, /ADM-068/);
    assert.match(zeile, /„Ohne Betreuung“/);
    assert.match(zeile, /„Bühnen und Stage Leads“/);
    assert.match(zeile, /„Noch keine Stage Lead“/);
    assert.match(zeile, /„Betreute Speaker \(n\)“/);
    assert.match(zeile, /„Aufnehmen“/);
  });

  it("Backlog: ADM-068 trägt die PR-Nummer und nennt, was gebaut ist und was nicht", () => {
    const zeile = quelle("docs/feedback/admin.md").split("\n").find((l) => l.startsWith("| ADM-068 |"));
    assert.ok(zeile && /\| P2 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "ADM-068 trägt keine PR-Nummer");
    assert.match(zeile, /Bühnen und Stage Leads/);
    assert.match(zeile, /Betreute Speaker/);
  });
});
