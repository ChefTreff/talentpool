import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  FREIGABE_ARTEN,
  FREIGABE_PFAD,
  freigabeNavigation,
  parseFreigabeZaehler,
  type FreigabeArt,
} from "@/lib/freigaben";
import { ADMIN_NAVIGATION, sichtbareNavigation } from "@/lib/admin-navigation";

/**
 * ADM-072b / ADM-080 / ADM-081 (Teil 1): die Freigaben im Admin-Menü — Summe am Punkt, darunter je Art ein
 * Unterpunkt mit eigener Zahl, nur für Arten, die die Person entscheiden darf. Die Datenbank-Seite belegt
 * `supabase/tests/v6_freigabe_zaehler.sql` (echter Rollenwechsel, Testdaten **und** Gegenstücke, Grundstand
 * gegen Endstand); hier steht, was sich ohne Datenbank festhalten lässt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

const TEXTE = {
  tab: { inhalte: "Titel", slots: "Slots", reisekosten: "Reisekosten", hotel: "Hotel", shuttle: "Shuttle" } as Record<
    FreigabeArt,
    string
  >,
  offen: "offen",
};

describe("ADM-072b: die Antwort der Funktion lesen", () => {
  it("nimmt bekannte Arten mit ganzen Zahlen ab 0", () => {
    assert.deepEqual(parseFreigabeZaehler({ inhalte: 2, slots: 0, hotel: 7 }), { inhalte: 2, slots: 0, hotel: 7 });
  });

  it("eine fehlende Art bleibt fehlend — sie heißt „nicht erlaubt“, nie „0“", () => {
    const z = parseFreigabeZaehler({ shuttle: 3 });
    assert.equal(z.shuttle, 3);
    for (const a of FREIGABE_ARTEN.filter((x) => x !== "shuttle")) assert.equal(z[a], undefined, a);
  });

  it("verwirft Fremdes und Beschädigtes statt es als 0 durchgehen zu lassen", () => {
    assert.deepEqual(parseFreigabeZaehler({ inhalte: "3", slots: -1, hotel: 1.5, reisekosten: null, shuttle: NaN }), {});
    assert.deepEqual(parseFreigabeZaehler({ unbekannt: 5, inhalte: 1 }), { inhalte: 1 });
    for (const kaputt of [null, undefined, "x", 5, [], [1, 2]]) assert.deepEqual(parseFreigabeZaehler(kaputt), {});
  });
});

describe("ADM-081: Zähler und Unterpunkte für den Menüpunkt „Freigaben“", () => {
  it("wer keine Art entscheiden darf, bekommt nichts am Punkt", () => {
    assert.equal(freigabeNavigation({}, TEXTE), undefined);
  });

  it("die Summe steht am Punkt, je Art ein Unterpunkt mit eigener Zahl, in der Reihenfolge der Reiter", () => {
    const n = freigabeNavigation({ inhalte: 2, slots: 3, reisekosten: 1, hotel: 0, shuttle: 4 }, TEXTE);
    assert.ok(n);
    assert.equal(n.count, 10);
    assert.equal(n.countLabel, "10 offen");
    assert.deepEqual(n.kinder?.map((k) => k.param?.value), [...FREIGABE_ARTEN]);
    assert.deepEqual(n.kinder?.map((k) => k.count), [2, 3, 1, 0, 4]);
    assert.deepEqual(n.kinder?.map((k) => k.href), FREIGABE_ARTEN.map((a) => `${FREIGABE_PFAD}?art=${a}`));
    assert.equal(n.kinder?.[1].label, "Slots");
    assert.equal(n.kinder?.[1].countLabel, "3 offen");
  });

  it("nur die Arten, die die Person entscheiden darf — wie die Reiter der Seite", () => {
    const n = freigabeNavigation({ shuttle: 1, hotel: 0 }, TEXTE);
    assert.deepEqual(n?.kinder?.map((k) => k.param?.value), ["hotel", "shuttle"]);
    assert.equal(n?.count, 1);
  });

  it("der Unterpunkt, den die Seite ohne Parameter wählt, trägt `standard` — dieselbe Wahl wie `waehleArt`", () => {
    // die erste Art mit offenen Einträgen
    const a = freigabeNavigation({ inhalte: 0, slots: 0, reisekosten: 3, hotel: 1 }, TEXTE);
    assert.deepEqual(a?.kinder?.filter((k) => k.param?.standard).map((k) => k.param?.value), ["reisekosten"]);
    // sonst die erste erlaubte
    const b = freigabeNavigation({ hotel: 0, shuttle: 0 }, TEXTE);
    assert.deepEqual(b?.kinder?.filter((k) => k.param?.standard).map((k) => k.param?.value), ["hotel"]);
  });

  it("die Leiste hängt den Zusatz nur an den Punkt mit dieser Adresse; ohne Zusatz bleibt alles, wie es war", () => {
    const nav = woerterbuch("de").admin.nav as Record<string, unknown>;
    const zusatz = freigabeNavigation({ inhalte: 1, shuttle: 2 }, TEXTE);
    assert.ok(zusatz);
    const mit = sichtbareNavigation(() => true, nav, { [FREIGABE_PFAD]: zusatz }).flatMap((g) => g.items);
    const ohne = sichtbareNavigation(() => true, nav).flatMap((g) => g.items);
    assert.equal(mit.length, ohne.length);
    for (const punkt of mit) {
      if (punkt.href === FREIGABE_PFAD) {
        assert.equal(punkt.count, 3);
        assert.equal(punkt.kinder?.length, 2);
      } else {
        assert.equal(punkt.count, undefined, punkt.href);
        assert.equal(punkt.kinder, undefined, punkt.href);
      }
    }
    assert.deepEqual(ohne.find((p) => p.href === FREIGABE_PFAD), { href: FREIGABE_PFAD, label: "Freigaben" });
    // der Punkt steht in der Leiste, an dessen Adresse der Zusatz hängt
    assert.ok(ADMIN_NAVIGATION.some((g) => g.punkte.some((p) => p.href === FREIGABE_PFAD)));
  });
});

describe("ADM-072b: Layout und Leiste", () => {
  it("das Layout fragt nur, wenn die Person überhaupt eine Art entscheiden darf, und bleibt ohne Zähler heil", () => {
    const l = quelle("app/(admin)/layout.tsx");
    // dieselbe Abschnittsliste wie Seite und Verlauf (lib/freigaben.ts), nicht eine eigene Abschrift
    assert.match(l, /FREIGABE_ABSCHNITTE,\s+FREIGABE_ARTEN,/);
    assert.doesNotMatch(l, /const FREIGABE_ABSCHNITTE =/);
    assert.match(l, /if \(FREIGABE_ABSCHNITTE\.some\(\(k\) => offen\.has\(k\)\)\)/);
    assert.match(l, /await ladeFreigabeZaehler\(\)/);
    assert.match(l, /sichtbareNavigation\(\(k\) => offen\.has\(k\), nav, zusatz\)/);
    assert.match(l, /zusatz\[FREIGABE_PFAD\] = freigaben;/);
    // die Texte kommen aus den Wörterbüchern der Freigaben (dieselben wie die Reiter)
    assert.match(l, /t\.adminApprovals\[`tab_\$\{a\}` as const\]/);
    assert.match(l, /offen: t\.adminApprovals\.openCount/);
  });

  it("der Aufruf ist eine Zugabe: Fehler und fehlende Funktion ergeben {}", () => {
    const s = quelle("lib/freigaben-server.ts");
    assert.match(s, /^import "server-only";/m);
    assert.match(s, /supabase\.rpc\("freigabe_zaehler"\)/);
    assert.match(s, /return error \? \{\} : parseFreigabeZaehler\(data\);/);
    assert.match(s, /\} catch \{\s+return \{\};/);
  });

  it("die Leiste zeigt die Zahl nur ab 1, als Badge mit Vorlesetext statt doppelter Zahl", () => {
    const s = quelle("components/layout/SidebarNav.tsx");
    assert.match(s, /item\.count !== undefined && item\.count > 0 &&/);
    assert.match(s, /k\.count !== undefined && k\.count > 0 &&/);
    // sichtbare Zahl für Screenreader aus, Wort („3 offen“) statt ihrer
    assert.match(s, /<span aria-hidden="true" className="ml-auto pl-2">/);
    assert.match(s, /<Badge tone=\{tone\}>\{count\}<\/Badge>/);
    assert.match(s, /\{label && <span className="sr-only">\{label\}<\/span>\}/);
  });

  it("Pink nur auf dunklem Grund: der aktive Punkt (helle Pille) nimmt den Akzent-Ton", () => {
    const s = quelle("components/layout/SidebarNav.tsx");
    assert.match(s, /tone=\{active \? "accent" : "highlight"\}/);
    // Die Unterpunkte tragen nur die Zahl: fünf rosa Pillen untereinander riefen fünfmal „dringend“
    assert.match(s, /<Zaehler count=\{k\.count\} label=\{k\.countLabel\} tone="text" \/>/);
    assert.match(s, /tone === "text" \? <span className="ct-label tabular-nums">\{count\}<\/span> : <Badge tone=\{tone\}>/);
  });

  it("Unterpunkte: aktiv über den Abfrageparameter, mit `standard` auch ohne ihn, nur unter dem aktiven Elternpunkt", () => {
    const s = quelle("components/layout/SidebarNav.tsx");
    assert.match(s, /useSearchParams/);
    assert.match(s, /<Suspense fallback=\{null\}>\s+<Unterpunkte kinder=\{item\.kinder\} elternAktiv=\{active\} \/>/);
    assert.match(s, /elternAktiv && !!k\.param && \(bekannt \? gesetzt === k\.param\.value : k\.param\.standard === true\)/);
    // ein Wert, den kein Unterpunkt kennt (?art=quatsch), gilt wie „kein Wert“: die Seite wählt selbst
    assert.match(s, /const bekannt = k\.param \? kinder\.some\(\(x\) => x\.param\?\.value === gesetzt\) : false;/);
    assert.match(s, /aria-current=\{aktiv \? "page" : undefined\}/);
    // Touch-Ziel wie die übrigen Punkte
    assert.match(s, /pointer-coarse:min-h-11/);
  });

  it("die Seite zählt wie das Menü: Bühnenart aus der Sicht, nicht aus der Liste der aktiven Bühnen", () => {
    assert.match(quelle("components/programme/loadFreigabe.ts"), /r\.stage_type !== "partner_booth"/);
    assert.doesNotMatch(quelle("components/programme/loadFreigabe.ts"), /standbuehnen/);
    assert.match(quelle("components/programme/types.ts"), /stage_type\?: string \| null;/);
  });
});

describe("ADM-072b: die Migration `v6_freigabe_zaehler`", () => {
  const sql = () => migrationText("v6_freigabe_zaehler");

  it("ist SECURITY INVOKER: die Slot-Zahl folgt der RLS des Boards, es gibt keine eigenen Rechte", () => {
    const c = code(sql());
    assert.doesNotMatch(c, /security definer/i);
    assert.match(c, /create or replace function freigabe_zaehler\(\)\s+returns jsonb\s+language plpgsql\s+stable\s+set search_path to 'public', 'extensions'/);
  });

  it("fragt je Art den Abschnitt und ruft die Listenfunktionen mit ihren eigenen Toren auf", () => {
    const c = code(sql());
    for (const abschnitt of ["submissions", "programme", "expenses", "hospitality"]) {
      assert.match(c, new RegExp(`has_admin_section\\('${abschnitt}'\\)`), abschnitt);
    }
    for (const liste of [
      "pending_submissions()",
      "partner_sessions_pending(v_event)",
      "expense_queue()",
      "hospitality_admin_overview()",
      "shuttle_bookings_admin()",
    ]) {
      assert.ok(c.includes(liste), `ruft ${liste} nicht auf`);
    }
    // eine Liste, die der Aufrufer nicht lesen darf, lässt die Art weg
    assert.equal((c.match(/exception when insufficient_privilege/g) ?? []).length, 4);
    assert.match(c, /my_manager_scope\(\) ->> 'is_manager'/);
  });

  it("zählt dieselben Stände wie die Seite", () => {
    const c = code(sql());
    const seite = quelle("app/(admin)/admin/einreichungen/page.tsx");
    assert.match(c, /q\.status = 'submitted'/);
    assert.match(seite, /c\.status === "submitted"/);
    assert.match(c, /b ->> 'status' in \('requested', 'waitlisted'\)/);
    assert.match(seite, /b\.status === "requested" \|\| b\.status === "waitlisted"/);
    assert.match(c, /s\.status = 'requested'/);
    assert.match(seite, /r\.status === "requested"/);
    // Slots: Entwurf und Prüfung, nicht Standbühne, nicht schon als Standbühnen-Anfrage gezählt
    assert.match(c, /b\.publish_status in \('draft', 'review'\)/);
    assert.match(c, /b\.stage_type is distinct from 'partner_booth'/);
    assert.match(c, /b\.session_id <> all \(v_partner\)/);
  });

  it("entzieht anon das Ausführen, lässt authenticated zu und endet mit der Härtung", () => {
    const c = code(sql());
    assert.match(c, /revoke execute on function freigabe_zaehler\(\) from public, anon;/);
    assert.match(c, /grant execute on function freigabe_zaehler\(\) to authenticated;/);
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("verlangt eine Anmeldung und gibt nur Zahlen heraus", () => {
    const c = code(sql());
    assert.match(c, /if current_person_id\(\) is null then raise exception 'not authenticated' using errcode = '28000'/);
    // keine Spalten aus person, keine Namen, kein to_jsonb auf Zeilen
    assert.doesNotMatch(c, /to_jsonb\(|row_to_json|first_name|last_name|email/i);
    assert.equal((c.match(/jsonb_build_object\(/g) ?? []).length, 5, "eine Zahl je Art");
  });
});

describe("ADM-081: Unterpunkte brauchen kein neues Wörterbuch", () => {
  it("die Texte sind die der Reiter der Seite, in DE und EN", () => {
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache);
      for (const a of FREIGABE_ARTEN) assert.ok(w.adminApprovals[`tab_${a}`], `${sprache}.adminApprovals.tab_${a}`);
      assert.ok(w.adminApprovals.openCount, `${sprache}.adminApprovals.openCount`);
    }
  });
});
