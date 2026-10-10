import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { baueZeilen, fehlende, standJeBuehne, type AssetZeile, type BoardZeile, type PraesentationsZeile } from "@/components/speaker/praesentationen";

/**
 * LEAD-058 (Feedbackrunde Konrad und Paulina 05.10.2026): die Präsentationsliste der Stage Leads zeigt **nur die eigenen Sessions** und macht je Bühne sichtbar, was **Soll**
 * ist und was **Ist** vorliegt („Stand je Bühne“, mit „Fehlende zeigen“). Die Rechte sind geprüft (LEAD-032): welche Zeilen ein Blick bekommt, entscheidet die Datenbank
 * (`programme_board.can_edit` aus `can_edit_slot`: Bühne, Bühnentag oder Slot der Rolle `speaker_manager`; Team alle), `baueZeilen` lässt nur diese durch — der Test
 * rechnet die ganze Kette aus (Zeilen eines Stage Leads ⇒ Stand), nicht nur die Anzeige. Keine Datenbankänderung. Der Stand steht im geteilten Baustein, also auch im Admin
 * unter Technik (dort für alle Bühnen).
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LISTE = "components/speaker/PraesentationenListe.tsx";

const slot = (z: Partial<BoardZeile>): BoardZeile => ({
  slot_id: "sl", session_id: "se", stage_id: "st", stage_name: "Bühne", start_at: "2027-04-16T13:00:00Z",
  end_at: "2027-04-16T13:30:00Z", title_de: "Talk", title_en: "Talk EN", can_edit: true, speakers: [], ...z,
});
const sprecher = (id: string, role = "speaker") => ({ person_id: id, role, first_name: id, last_name: "ZZ" });
const asset = (z: Partial<AssetZeile>): AssetZeile => ({
  id: "a", profile_id: "pr1", session_id: "se", kind: "presentation", filename: "folien.pdf", version: 1,
  is_current: true, late: false, tech_check_status: "pending", created_at: "2027-04-01T10:00:00Z", ...z,
});

describe("LEAD-058: Soll und Ist je Bühne (ausgeführt)", () => {
  // Zwei Bühnen: A hat drei Sessions (eine ganz da, eine halb, eine ohne Profil), B hat eine vollständige und eine Session ohne Speaker.
  const board: BoardZeile[] = [
    slot({ slot_id: "s1", session_id: "e1", stage_id: "a", stage_name: "Main Stage", speakers: [sprecher("p1")] }),
    slot({ slot_id: "s2", session_id: "e2", stage_id: "a", stage_name: "Main Stage", speakers: [sprecher("p2"), sprecher("p3")] }),
    slot({ slot_id: "s3", session_id: "e3", stage_id: "a", stage_name: "Main Stage", speakers: [sprecher("p4"), sprecher("mod", "moderator")] }),
    slot({ slot_id: "s4", session_id: "e4", stage_id: "b", stage_name: "Äther Stage", speakers: [sprecher("p5")] }),
    slot({ slot_id: "s5", session_id: "e5", stage_id: "b", stage_name: "Äther Stage", speakers: [] }),
  ];
  const profile = [
    { id: "pr1", person_id: "p1" },
    { id: "pr2", person_id: "p2" },
    { id: "pr3", person_id: "p3" },
    { id: "pr5", person_id: "p5" },
  ]; // p4 hat kein betreutes Profil
  const assets = [
    asset({ id: "x1", profile_id: "pr1", session_id: "e1" }),
    asset({ id: "x2", profile_id: "pr3", session_id: "e2" }),
    asset({ id: "x3", profile_id: "pr5", session_id: "e4" }),
  ];
  const zeilen = baueZeilen(board, profile, assets, "de");

  it("je Bühne Sessions, Soll (Speaker mit Profil), Ist, Fehlt und die ohne Profil — Moderation zählt nicht, Sessions ohne Speaker nur als Session", () => {
    const stand = standJeBuehne(zeilen);
    assert.deepEqual(
      stand.map((b) => ({ ...b })),
      [
        { stage_id: "b", stage_name: "Äther Stage", sessions: 2, soll: 1, ist: 1, fehlt: 0, ohneProfil: 0 },
        { stage_id: "a", stage_name: "Main Stage", sessions: 3, soll: 3, ist: 2, fehlt: 1, ohneProfil: 1 },
      ],
    );
  });

  it("sortiert nach Bühnenname, deutsch (Ä vor M)", () => {
    assert.deepEqual(standJeBuehne(zeilen).map((b) => b.stage_name), ["Äther Stage", "Main Stage"]);
  });

  it("die Summe der „Fehlt“ je Bühne ist `fehlende(zeilen)` — die Kopfzahl und die Marken sagen dasselbe", () => {
    assert.equal(standJeBuehne(zeilen).reduce((n, b) => n + b.fehlt, 0), fehlende(zeilen));
    assert.equal(fehlende(zeilen), 1);
  });

  it("Soll = Ist + Fehlt je Bühne; nur die aktuelle Fassung zählt als Ist, eine alte oder eine fremde Session nicht", () => {
    for (const b of standJeBuehne(zeilen)) assert.equal(b.soll, b.ist + b.fehlt, b.stage_name);
    const alt = baueZeilen(
      [slot({ session_id: "e1", speakers: [sprecher("p1")] })],
      [{ id: "pr1", person_id: "p1" }],
      [asset({ session_id: "e1", is_current: false }), asset({ id: "y", session_id: "andere" }), asset({ id: "z", kind: "photo", session_id: "e1" })],
      "de",
    );
    assert.deepEqual({ ...standJeBuehne(alt)[0] }, { stage_id: "st", stage_name: "Bühne", sessions: 1, soll: 1, ist: 0, fehlt: 1, ohneProfil: 0 });
  });

  it("nur die eigenen Sessions: Zeilen, die der Blick nicht bearbeiten darf (`can_edit` falsch), und Slots ohne Session kommen gar nicht erst in den Stand — der Stage Lead sieht nur seine Bühne", () => {
    const fremd = baueZeilen(
      [
        slot({ slot_id: "m1", session_id: "m1", stage_id: "mine", stage_name: "Meine Bühne", speakers: [sprecher("p1")] }),
        slot({ slot_id: "f1", session_id: "f1", stage_id: "fremd", stage_name: "Fremde Bühne", can_edit: false, speakers: [sprecher("p2")] }),
        slot({ slot_id: "f2", session_id: null, stage_id: "mine", stage_name: "Meine Bühne", speakers: [] }),
      ],
      [{ id: "pr1", person_id: "p1" }, { id: "pr2", person_id: "p2" }],
      [asset({ profile_id: "pr2", session_id: "f1" })],
      "de",
    );
    const stand = standJeBuehne(fremd);
    assert.deepEqual(stand.map((b) => b.stage_name), ["Meine Bühne"]);
    assert.equal(stand[0].soll, 1);
    assert.equal(stand[0].ist, 0, "die Datei der fremden Session erscheint nirgends");
  });

  it("ohne Zeilen kein Stand; eine Bühne, auf der alle Speaker ohne Profil sind, hat Soll 0", () => {
    assert.deepEqual(standJeBuehne([]), []);
    const nur: PraesentationsZeile[] = baueZeilen([slot({ speakers: [sprecher("p9")] })], [], [], "de");
    assert.deepEqual({ ...standJeBuehne(nur)[0] }, { stage_id: "st", stage_name: "Bühne", sessions: 1, soll: 0, ist: 0, fehlt: 0, ohneProfil: 1 });
  });
});

describe("LEAD-058: die Anzeige", () => {
  it("der Stand rechnet über alle Zeilen (nicht über die gefilterten), steht vor den Filtern und trägt den Titel „Stand je Bühne“", () => {
    const q = quelle(LISTE);
    assert.match(q, /const stand = useMemo\(\(\) => standJeBuehne\(zeilen\), \[zeilen\]\);/);
    assert.doesNotMatch(q, /standJeBuehne\(sichtbar\)/);
    assert.ok(q.indexOf('aria-labelledby="praes-stand"') > 0 && q.indexOf('aria-labelledby="praes-stand"') < q.indexOf('{buehnen.length > 1 && ('), "der Stand steht vor den Filtern");
    assert.match(q, /<h2 id="praes-stand" className="ct-h3 mb-2 text-ink">\s+\{t\.standTitle\}/);
  });

  it("je Bühne: Zählung mit Soll und Ist, Zustand als Marke mit Text (Fehlt: n / Vollständig), „Fehlende zeigen“ nur bei Fehlendem — und es stellt Bühne und „Nur fehlende“ ein", () => {
    const q = quelle(LISTE);
    assert.match(q, /t\.standCount\.replace\("\{ist\}", String\(b\.ist\)\)\.replace\("\{soll\}", String\(b\.soll\)\)/);
    assert.match(q, /b\.fehlt > 0 \? \(\s+<Badge tone="warning">\{t\.standMissing\.replace\("\{n\}", String\(b\.fehlt\)\)\}<\/Badge>\s+\) : \(\s+<Badge tone="success">\{t\.standComplete\}<\/Badge>/);
    assert.match(q, /\{b\.soll > 0 &&/, "ohne Soll keine Marke „Vollständig“");
    assert.match(q, /\{b\.fehlt > 0 && \(\s+<Button\s+size="sm"\s+variant="ghost"\s+aria-label=\{`\$\{t\.standShowMissing\}: \$\{b\.stage_name\}`\}\s+onClick=\{\(\) => setFilter\(\{ buehne: b\.stage_id, fehlend: "1" \}\)\}/);
    assert.match(q, /b\.sessions === 1 \? t\.standSessionOne : t\.standSessions\.replace\("\{n\}", String\(b\.sessions\)\)/);
    assert.match(q, /b\.ohneProfil > 0 && <p className="ct-help">\{t\.standNoProfile\.replace\("\{n\}", String\(b\.ohneProfil\)\)\}<\/p>/);
  });

  it("die Textspalte hat eine Mindestbreite — kein Zusammenpressen am Handy (SPK-096)", () => {
    assert.match(quelle(LISTE), /<div className="min-w-0 flex-1 basis-48">/);
  });

  it("derselbe Baustein im Stage-Lead-Portal und im Admin: beide Seiten reichen ihre Zeilen an `PraesentationenListe`", () => {
    for (const p of ["app/(speaker-leads)/speaker-leads/praesentationen/page.tsx", "app/(admin)/admin/technik/praesentationen/page.tsx"]) {
      assert.match(quelle(p), /<PraesentationenListe\s+zeilen=\{data\.zeilen\}/, p);
    }
  });

  it("Texte DE und EN: alle acht Schlüssel mit ihren Platzhaltern", () => {
    for (const lang of ["de", "en"]) {
      const d = (JSON.parse(quelle(`lib/i18n/${lang}.json`)) as { presentationsList: Record<string, string> }).presentationsList;
      for (const k of ["standTitle", "standComplete", "standShowMissing", "standSessionOne"]) assert.ok((d[k] ?? "").length > 2, `${lang}.${k}`);
      assert.ok(d.standCount.includes("{ist}") && d.standCount.includes("{soll}"), `${lang}.standCount`);
      assert.ok(d.standMissing.includes("{n}"), `${lang}.standMissing`);
      assert.ok(d.standNoProfile.includes("{n}"), `${lang}.standNoProfile`);
      assert.ok(d.standSessions.includes("{n}"), `${lang}.standSessions`);
    }
  });
});

describe("LEAD-058: Rechte (LEAD-032) und Daten", () => {
  it("gelesen wird mit der Sitzung — nichts mit dem Admin-Schlüssel; die Zeilen kommen aus `programme_board` und werden mit `can_edit` gefiltert", () => {
    // ohne Kommentare gelesen: im Kopf der Datei steht das Wort „service_role“ als Erklärung
    const l = quelle("lib/speaker/praesentationen.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(l, /createSupabaseAdminClient|service_role/);
    assert.match(l, /from\("programme_board"\)/);
    assert.match(quelle("components/speaker/praesentationen.ts"), /\.filter\(\(s\) => s\.can_edit && s\.session_id\)/);
  });

  it("die Datenbank liefert `can_edit` je Slot aus `can_edit_slot` — für `speaker_manager` nur mit Bühne, Bühnentag oder Slot (kein Edition-Zweig)", () => {
    const f = quelle("supabase/snapshot/functions/can_edit_slot.sql");
    assert.match(f, /ra\.role in \('speaker_manager','standbuehne_editor'\) and ra\.scope_type = 'stage' and ra\.scope_id = s\.stage_id/);
    assert.match(f, /ra\.role = 'speaker_manager' and ra\.scope_type = 'stage_day' and ra\.scope_id = sd\.id/);
    assert.match(f, /ra\.role = 'speaker_manager' and ra\.scope_type = 'slot' and ra\.scope_id = s\.id/);
    assert.doesNotMatch(f, /speaker_manager'[^)]*scope_type = 'global'|speaker_manager'[^)]*scope_type = 'edition'/);
  });
});

describe("LEAD-058: Doku", () => {
  it("Testleitfaden: Stand je Bühne in der Zeile der Präsentationen und im Admin unter Technik", () => {
    const zeilen = quelle("docs/team-testleitfaden.md").split("\n");
    const lead = zeilen.find((l) => l.startsWith("| `/praesentationen` Präsentationen |"));
    assert.ok(lead, "Zeile fehlt");
    assert.match(lead, /„Stand je Bühne“ \(LEAD-058\)/);
    assert.match(lead, /„Fehlende zeigen“/);
    assert.match(lead, /nur die Sessions deiner Bühnen/);
    const admin = zeilen.find((l) => l.startsWith("| `/admin/technik` Technik |"));
    assert.ok(admin && /„Stand je Bühne“ \(LEAD-058/.test(admin), "Admin-Zeile nennt den Stand nicht");
  });

  it("Backlog: LEAD-058 trägt die PR-Nummer; ADM-070 steht auf „gebaut #474“", () => {
    const lead = quelle("docs/feedback/speaker-leads.md").split("\n").find((l) => l.startsWith("| LEAD-058 |"));
    assert.ok(lead && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(lead), "LEAD-058 trägt keine PR-Nummer");
    assert.match(lead, /keine Migration/);
    assert.match(lead, /LEAD-059/);
    const adm = quelle("docs/feedback/admin.md").split("\n").find((l) => l.startsWith("| ADM-070 |"));
    assert.ok(adm && /\| P1 \| gebaut #474 \(minimal, Untermenü offen \(K-95\)/.test(adm), "ADM-070 nicht auf gebaut #474");
  });
});
