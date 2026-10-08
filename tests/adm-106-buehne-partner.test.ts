import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PARTNER_WAHL_ARTEN,
  gewaehlterPartner,
  partnerFeldSichtbar,
  partnerFuerNeue,
  partnerFuerSpeichern,
} from "@/app/(admin)/admin/edition/felder";
import { BUEHNEN_ARTEN } from "@/app/(admin)/admin/edition/types";

/**
 * ADM-106: die Partner-Organisation im Bühnenformular unter `/admin/edition`. Keine Migration — `upsert_stage` kann `partner_org_id` seit
 * 0110, `stage.kind` leitet daraus „gebrandet“ ab (0274). Die Auswahl-Regeln (wann das Feld erscheint, was beim Speichern mitgeht, wer
 * als gewählt gilt) laufen hier **ausgeführt**; Oberfläche, Anbindung an die Datenbank-Funktionen und Texte sind Quelltext-Belege.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("ADM-106: wann das Partner-Feld erscheint (ausgeführt)", () => {
  it("nur bei Haupt- und Nebenbühne — dort ist der Partner eine Wahl, sonst setzen ihn die Partner-Funktionen", () => {
    assert.deepEqual([...PARTNER_WAHL_ARTEN], ["main", "side"]);
    for (const art of ["main", "side"]) assert.equal(partnerFeldSichtbar(art), true, art);
    for (const art of ["partner_booth", "room", "interview_table", "side_event_venue", "", "Main", "booth", null, undefined]) {
      assert.equal(partnerFeldSichtbar(art), false, String(art));
    }
  });

  it("die Arten mit Partner-Feld sind Arten, die das Formular kennt", () => {
    for (const art of PARTNER_WAHL_ARTEN) assert.ok((BUEHNEN_ARTEN as readonly string[]).includes(art), art);
  });
});

describe("ADM-106: was beim Speichern einer bestehenden Bühne mitgeht (ausgeführt)", () => {
  it("nichts angefasst: der Schlüssel fehlt, der Stand bleibt", () => {
    assert.equal(partnerFuerSpeichern("main", undefined), undefined);
    assert.equal(partnerFuerSpeichern("side", undefined), undefined);
  });

  it("gewählt: die ID geht mit; abgenommen: die leere ID geht mit (`upsert_stage` macht NULL daraus)", () => {
    assert.equal(partnerFuerSpeichern("main", "org-1"), "org-1");
    assert.equal(partnerFuerSpeichern("side", "org-1"), "org-1");
    assert.equal(partnerFuerSpeichern("main", ""), "");
  });

  it("bei einer Art ohne Feld geht nichts mit — auch nicht, wenn der Entwurf noch eine ID trägt (Art danach gewechselt)", () => {
    for (const art of ["partner_booth", "room", "interview_table", "side_event_venue", null, undefined]) {
      assert.equal(partnerFuerSpeichern(art, "org-1"), undefined, String(art));
      assert.equal(partnerFuerSpeichern(art, ""), undefined, String(art));
    }
  });
});

describe("ADM-106: was beim Anlegen einer neuen Bühne mitgeht (ausgeführt)", () => {
  it("nur eine gewählte ID bei Haupt- oder Nebenbühne", () => {
    assert.equal(partnerFuerNeue("main", "org-1"), "org-1");
    assert.equal(partnerFuerNeue("side", "org-1"), "org-1");
  });

  it("nichts gewählt oder abgenommen: kein Schlüssel — eine neue Bühne braucht keine leere ID", () => {
    assert.equal(partnerFuerNeue("main", undefined), undefined);
    assert.equal(partnerFuerNeue("main", ""), undefined);
  });

  it("eine Art ohne Feld nimmt einen früher gewählten Partner nicht mit", () => {
    for (const art of ["partner_booth", "room", "interview_table", "side_event_venue", ""]) {
      assert.equal(partnerFuerNeue(art, "org-1"), undefined, art);
    }
  });
});

describe("ADM-106: wer als gewählt gilt (ausgeführt)", () => {
  const stand = { id: "org-alt", name: "Alt GmbH" };

  it("ohne Entwurf der gespeicherte Stand — oder niemand", () => {
    assert.deepEqual(gewaehlterPartner(undefined, stand, {}), { id: "org-alt", name: "Alt GmbH" });
    assert.equal(gewaehlterPartner(undefined, { id: null, name: null }, {}), null);
    // eine ID ohne Namen bleibt eine ID ohne Namen
    assert.deepEqual(gewaehlterPartner(undefined, { id: "org-alt", name: null }, {}), { id: "org-alt", name: null });
  });

  it("der Entwurf gewinnt: leer heißt abgewählt, auch wenn etwas gespeichert ist", () => {
    assert.equal(gewaehlterPartner("", stand, { "org-alt": "Alt GmbH" }), null);
    assert.equal(gewaehlterPartner("", { id: null, name: null }, {}), null);
  });

  it("ein frisch gewählter Partner zeigt seinen Namen aus der Suche, nie den Namen des gespeicherten", () => {
    assert.deepEqual(gewaehlterPartner("org-neu", stand, { "org-neu": "Neu AG" }), { id: "org-neu", name: "Neu AG" });
    // der Name ist (noch) nicht bekannt: kein fremder Name, nur die ID
    assert.deepEqual(gewaehlterPartner("org-neu", stand, {}), { id: "org-neu", name: null });
  });

  it("wer den gespeicherten Partner abnimmt und wieder wählt, sieht dessen Namen auch ohne neue Suche — und kennt die Suche den Namen, gilt der frische", () => {
    assert.deepEqual(gewaehlterPartner("org-alt", stand, {}), { id: "org-alt", name: "Alt GmbH" });
    assert.deepEqual(gewaehlterPartner("org-alt", stand, { "org-alt": "Alt GmbH (umbenannt)" }), { id: "org-alt", name: "Alt GmbH (umbenannt)" });
  });
});

describe("ADM-106: Oberfläche (Quelltext)", () => {
  const v = quelle("app/(admin)/admin/edition/GeruestView.tsx");

  it("die Suche ist die der Programm-Oberfläche — Organisationen dieser Edition, in einer stabilen Funktion", () => {
    assert.match(v, /import \{ searchBoardPartners \} from "@\/components\/programme\/actions";/);
    assert.match(v, /const suchePartner = useCallback\(\(q: string\) => searchBoardPartners\(eventId, q\), \[eventId\]\);/);
  });

  it("jede Zeile mit Haupt- oder Nebenbühne zeigt die Suchauswahl kompakt, die anderen zeigen den Partner nur an", () => {
    assert.match(v, /const zeigtPartner = \(s: GeruestBuehne\) => partnerFeldSichtbar\(wert\(s\.id, "type", s\.type\)\);/);
    assert.match(v, /\{zeigtPartner\(s\) \? \(\s+<div className="mt-2">\s+<SuchAuswahl\s+kompakt\s+id=\{`partner-\$\{s\.id\}`\}/);
    assert.match(v, /suchen=\{suchePartner\}\s+onChange=\{\(h\) => waehlePartner\(s\.id, h\)\}/);
    // Stände, Räume und Co.: der Name steht nur da (kein Feld), wie vorher
    assert.match(v, /s\.partner_org_name && s\.kind !== "branded" && <span className="ct-help block text-muted">\{s\.partner_org_name\}<\/span>/);
    // zeigt die Zeile die Suchauswahl, steht der Partner dort — die Art-Zeile wiederholt ihn nicht
    assert.match(v, /\{!zeigtPartner\(s\) && s\.kind === "branded" && s\.partner_org_name/);
  });

  it("Auswahl und Abnehmen landen im Entwurf der Zeile (leer = abgenommen), der Name wird für die Anzeige gemerkt", () => {
    assert.match(v, /if \(h\) setPartnerNamen\(\(n\) => \(\{ \.\.\.n, \[h\.id\]: h\.name \}\)\);\s+setzen\(id, "partner_org_id", h \? h\.id : ""\);/);
    assert.match(v, /gewaehlterPartner\(\s+entwurf\[s\.id\]\?\.partner_org_id,\s+\{ id: s\.partner_org_id, name: s\.partner_org_name \},\s+partnerNamen,\s+\)/);
  });

  it("Speichern und Anlegen gehen über die geprüften Regeln — der Partner steht nur drin, wo das Formular ihn zeigt", () => {
    assert.match(v, /const partner = partnerFuerSpeichern\(rest\.type \?\? s\.type, partner_org_id\);/);
    assert.match(v, /\.\.\.\(partner !== undefined \? \{ partner_org_id: partner \} : \{\}\),/);
    assert.match(v, /const partner = partnerFuerNeue\(art, neu\[f\.key\]\);\s+if \(partner === undefined\) delete neu\[f\.key\];\s+else neu\[f\.key\] = partner;/);
    // die neue Zeile: Feld hinter der Art, nur mit Suche und Texten
    assert.match(v, /\{ key: "type", label: t\.colType, options: [^\n]+\},\s+\{ key: "partner_org_id", label: t\.partnerLabel, partner: true \},/);
    assert.match(v, /suchen=\{suchePartner\}\s+partnerTexte=\{\{ placeholder: t\.partnerSearch, remove: t\.partnerRemove, noHits: t\.partnerNoHits \}\}/);
    assert.match(v, /const zeigtPartner = \(f: Feld\) => Boolean\(f\.partner && suchen && partnerTexte && partnerFeldSichtbar\(art\)\);/);
  });

  it("die Tabelle bekommt keine neue Spalte (die frühere Spalte „Partnerbühne“ entfiel, damit „Gilt an“ hineinpasst)", () => {
    const kopf = v.slice(v.indexOf("<Thead>", v.indexOf('id="buehnen"')), v.indexOf("</Thead>", v.indexOf('id="buehnen"')));
    assert.doesNotMatch(kopf, /colPartner|partnerLabel/);
    assert.equal((kopf.match(/<Th[ >/]/g) ?? []).length, 9);
  });

  it("die Aktion bleibt, wie sie war: nur die RPC `upsert_stage` hinter dem Abschnitt „edition“", () => {
    const a = quelle("app/(admin)/admin/edition/actions.ts");
    assert.match(a, /export async function saveStage\(data: Record<string, unknown>\) \{\s+return rpc\("upsert_stage", \{ p_data: data \}\);/);
    assert.match(a, /async function client\(\) \{\s+await requireAdminSection\("edition", PATH\);/);
  });

  it("die Suchauswahl bleibt für alle bisherigen Aufrufer unverändert und kennt die kompakte Fassung nur auf Wunsch", () => {
    const s = quelle("components/programme/SuchAuswahl.tsx");
    assert.match(s, /kompakt = false,/);
    // mit Beschriftung, Hilfszeile und Pflichtmarke wie bisher …
    assert.match(s, /<Field label=\{label\} htmlFor=\{id\} hint=\{hint\} required=\{required\} requiredLabel=\{requiredLabel\}>/);
    // … kompakt ohne Hülle: die Beschriftung steht als aria-label am Feld
    assert.match(s, /kompakt \? \(\s+<div className=\{`flex flex-col \$\{className \?\? ""\}`\.trim\(\)\}>\{inhalt\}<\/div>/);
    assert.match(s, /aria-label=\{kompakt \? label : undefined\}/);
    // eine Auswahl wird weiter durch das × abgenommen, nie durch Weitertippen ersetzt
    assert.match(s, /onClick=\{\(\) => onChange\(null\)\}/);
    // die anderen Aufrufer übergeben kompakt nicht (jedes Element ganz, bis zu seinem `/>` — Pfeilfunktionen in den Attributen tragen ein `>`)
    for (const p of ["components/programme/SessionDrawer.tsx", "app/(speaker-leads)/speaker-leads/shuttle/LeadShuttle.tsx"]) {
      const elemente = quelle(p).match(/<SuchAuswahl\b[\s\S]*?\/>/g) ?? [];
      assert.ok(elemente.length > 0, `${p}: kein <SuchAuswahl> gefunden`);
      for (const el of elemente) assert.doesNotMatch(el, /\bkompakt\b/, p);
    }
  });
});

describe("ADM-106: die Datenbank-Seite, auf die sich die Oberfläche verlässt (Snapshot der Live-Fassung)", () => {
  it("`board_search_partners` liefert nur Organisationen der Edition — nicht alle HubSpot-Firmen — und prüft das Recht selbst", () => {
    const f = code(quelle("supabase/snapshot/functions/board_search_partners.sql"));
    assert.match(f, /if not can_search_board\(p_event_id\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.match(f, /select coalesce\(ev\.edition_id, ev\.id\) into v_ed from event ev where ev\.id = p_event_id;/);
    assert.match(f, /exists \(select 1 from org_edition oe where oe\.org_id = o\.id and oe\.edition_id = v_ed\)/);
    // zwei Zeichen mindestens, höchstens 25 Treffer: keine Liste „alles“
    assert.match(f, /length\(btrim\(coalesce\(p_query, ''\)\)\) < 2 then return;/);
    assert.match(f, /limit least\(greatest\(coalesce\(p_limit, 10\), 1\), 25\)/);
  });

  it("wer die Seite sieht (`programme_skeleton` verlangt `is_programme_editor`), darf auch suchen (`can_search_board` schließt ihn ein)", () => {
    assert.match(code(quelle("supabase/snapshot/functions/programme_skeleton.sql")), /if not is_programme_editor\(v_ev\) then raise exception 'not allowed'/);
    assert.match(code(quelle("supabase/snapshot/functions/can_search_board.sql")), /is_programme_editor\(p_event_id\)/);
  });

  it("`upsert_stage` kennt den Schlüssel: leer nimmt den Partner ab, fehlender Schlüssel lässt den Stand — beim Anlegen wie beim Ändern", () => {
    const f = code(quelle("supabase/snapshot/functions/upsert_stage.sql"));
    assert.match(f, /nullif\(p_data->>'partner_org_id', ''\)::uuid, nullif\(p_data->>'stage_lead_person_id', ''\)::uuid/);
    assert.match(f, /partner_org_id\s+= case when p_data \? 'partner_org_id' then nullif\(p_data->>'partner_org_id', ''\)::uuid else partner_org_id end/);
    assert.match(f, /if not is_programme_editor\(v_event\) then raise exception 'not allowed' using errcode = '42501'; end if;/);
    assert.match(f, /perform log_audit\('programme\.stage_upsert', 'stage', v_id::text, v_before, p_data\);/);
  });

  it("das Gerüst liefert Partner und Namen je Bühne, die Zeile zeigt sie", () => {
    const f = code(quelle("supabase/snapshot/functions/programme_skeleton.sql"));
    assert.match(f, /'partner_org_id', st\.partner_org_id,\s+'partner_org_name'/);
    const t = quelle("app/(admin)/admin/edition/types.ts");
    assert.match(t, /partner_org_id: string \| null;\s+partner_org_name: string \| null;/);
  });

  it("die Wirkung, die der Hinweis im Formular nennt: der Partner bearbeitet die Slots der Bühne (Standbühnen-Editor der Organisation)", () => {
    const f = code(quelle("supabase/snapshot/functions/can_edit_slot.sql"));
    assert.match(f, /ra\.role = 'standbuehne_editor' and ra\.scope_type = 'org' and st\.partner_org_id is not null and ra\.scope_id = st\.partner_org_id/);
    const m = code(quelle("supabase/snapshot/functions/my_partner_stages.sql"));
    assert.match(m, /ra\.scope_type = 'org' and st\.partner_org_id is not null and ra\.scope_id = st\.partner_org_id/);
  });
});

describe("ADM-106: Texte in beiden Sprachen", () => {
  it("die vier neuen Schlüssel sind da, nicht leer und ohne Platzhalter", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).adminEdition;
      for (const k of ["partnerLabel", "partnerNoHits", "partnerRemove", "partnerSearch"]) {
        assert.equal(typeof w[k], "string", `${sprache}.adminEdition.${k}`);
        assert.ok(w[k].trim() !== "", `${sprache}.adminEdition.${k} ist leer`);
        assert.doesNotMatch(w[k], /\{/, `${sprache}.adminEdition.${k}`);
      }
    }
  });

  it("der Hinweis an den Bühnen nennt die Folge: gebrandet, und der Partner bearbeitet die Slots mit der Rolle Standbühnen-Editor", () => {
    const de = woerterbuch("de").adminEdition.stagesHint as string;
    assert.match(de, /Partner-Organisation/);
    assert.match(de, /gebrandet/);
    assert.match(de, /Standbühnen-Editor/);
    const en = woerterbuch("en").adminEdition.stagesHint as string;
    assert.match(en, /partner organisation/);
    assert.match(en, /branded/);
    assert.match(en, /stage editor/);
  });

  it("das Suchfeld trägt einen kurzen Platzhalter (die schmale Zelle schneidet Längeres ab)", () => {
    for (const sprache of ["de", "en"] as const) {
      const p = woerterbuch(sprache).adminEdition.partnerSearch as string;
      assert.ok(p.length <= 16, `${sprache}: ${p}`);
      assert.doesNotMatch(p, /…/, sprache);
    }
  });
});

describe("ADM-106: Doku", () => {
  it("der Testleitfaden sagt, wo Konrad klickt, und die Testdaten-Doku, mit welchen Schritten", () => {
    const leitfaden = quelle("docs/team-testleitfaden.md");
    assert.match(leitfaden, /\*\*Partner-Organisation \(ADM-106\):\*\*/);
    const daten = quelle("docs/testdaten-konrad.md");
    assert.match(daten, /\*\*Partner-Organisation einer Bühne \(ADM-106\):\*\*/);
    assert.match(daten, /--nur=buehne/);
    assert.match(daten, /--nur=partner/);
  });
});
