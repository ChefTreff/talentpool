import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  herkunftNachProfil,
  LISTE_NEU,
  NEUE_SPEAKER_PFAD,
  neueSpeakerNavigation,
  parseNeueSpeakerZahl,
} from "@/lib/neue-speaker";
import { ADMIN_NAVIGATION, sichtbareNavigation } from "@/lib/admin-navigation";

/**
 * ADM-084: die Liste „Neue Speaker“ — von Partnern angelegte Speaker, mit Marke in der Speaker-Liste und Zähler am Menüpunkt.
 * Die Datenbank-Seite belegt `supabase/tests/v6_neue_speaker.sql` (echter Rollenwechsel, Gegenstücke als Vorbedingung, die
 * Stage-Lead-Probe, 42501 für alle anderen); hier steht, was sich ohne Datenbank festhalten lässt: die Leseregeln der
 * Oberfläche, dass kein zweiter Schreibweg entsteht, dass die Leiste nicht wächst, und der Text der Migration.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

describe("ADM-084: die Zahl für das Menü lesen", () => {
  it("nimmt ganze Zahlen ab 0 und sonst keine Auskunft", () => {
    assert.equal(parseNeueSpeakerZahl(0), 0);
    assert.equal(parseNeueSpeakerZahl(7), 7);
    for (const kaputt of [null, undefined, -1, 1.5, "3", NaN, Infinity, {}, [], true]) {
      assert.equal(parseNeueSpeakerZahl(kaputt), null, String(kaputt));
    }
  });

  it("ohne Auskunft bleibt der Menüpunkt, wie er ist; mit Auskunft trägt er die Zahl und den Vorlesetext", () => {
    const vorlesen = (n: number) => `${n} neu`;
    assert.equal(neueSpeakerNavigation(null, vorlesen), undefined);
    assert.deepEqual(neueSpeakerNavigation(3, vorlesen), { count: 3, countLabel: "3 neu" });
    // 0 ist eine Auskunft („nichts neu“) — die Leiste blendet die Zahl selbst aus
    assert.deepEqual(neueSpeakerNavigation(0, vorlesen), { count: 0, countLabel: "0 neu" });
    // nur Zahl und Vorlesetext, kein Unterpunkt: die Leiste wächst nicht
    assert.equal(Object.keys(neueSpeakerNavigation(3, vorlesen) ?? {}).sort().join(","), "count,countLabel");
  });

  it("die Zahl hängt am vorhandenen Punkt „Speaker“; die Leiste bekommt keinen Punkt dazu", () => {
    const speaker = ADMIN_NAVIGATION.flatMap((g) => g.punkte).filter((p) => p.href === NEUE_SPEAKER_PFAD);
    assert.equal(speaker.length, 1, "genau ein Punkt zeigt auf /admin/speaker");
    assert.equal(speaker[0].section, "speakers");
    const alle = () => true;
    const nav = {} as Record<string, unknown>;
    const ohne = sichtbareNavigation(alle, nav).flatMap((g) => g.items);
    const mit = sichtbareNavigation(alle, nav, {
      [NEUE_SPEAKER_PFAD]: neueSpeakerNavigation(2, (n) => `${n} neu`)!,
    }).flatMap((g) => g.items);
    assert.equal(mit.length, ohne.length, "gleich viele Punkte mit und ohne Zähler");
    const punkt = mit.find((p) => p.href === NEUE_SPEAKER_PFAD);
    assert.equal(punkt?.count, 2);
    assert.equal(punkt?.countLabel, "2 neu");
    assert.equal(punkt?.kinder, undefined);
    // alle anderen Punkte bleiben unberührt
    for (const p of mit.filter((x) => x.href !== NEUE_SPEAKER_PFAD)) {
      assert.equal(p.count, undefined, p.href);
    }
  });
});

describe("ADM-084: die Marke in der Speaker-Liste", () => {
  it("nennt je Profil Partner und Stand „neu“; ohne Namen steht der Ersatzname da", () => {
    const k = herkunftNachProfil(
      [
        { profile_id: "a", partner_name: "Muster GmbH", is_new: true },
        { profile_id: "b", partner_name: "  Zweite AG  ", is_new: false },
        { profile_id: "c", partner_name: null, is_new: true },
        { profile_id: "d", partner_name: "   ", is_new: false },
      ],
      "Partner",
    );
    assert.deepEqual(k, {
      a: { partner: "Muster GmbH", neu: true },
      b: { partner: "Zweite AG", neu: false },
      c: { partner: "Partner", neu: true },
      d: { partner: "Partner", neu: false },
    });
    assert.deepEqual(herkunftNachProfil([], "Partner"), {});
  });

  it("die Liste zeigt „von <Partner>“ bei jeder Herkunft und „Neu“ nur bei is_new — beides als Text, nicht nur als Farbe", () => {
    const l = quelle("app/(admin)/admin/speaker/SpeakerListe.tsx");
    assert.match(l, /herkunft\?: Record<string, Herkunft>/);
    assert.match(l, /\{herkunft\[r\.id\] && \(\s+<Badge className="ml-2">\{t\.fromPartner\.replace\("\{partner\}", herkunft\[r\.id\]\.partner\)\}<\/Badge>/);
    assert.match(l, /\{herkunft\[r\.id\]\?\.neu && \(\s+<Badge tone="warning" className="ml-2">\s+\{t\.badgeNew\}/);
    // die Gast-Marke bleibt, wie sie war
    assert.match(l, /\{r\.stage_guest && <Badge className="ml-2">\{tg\.badge\}<\/Badge>\}/);
  });
});

describe("ADM-084: die Seite", () => {
  const seite = () => quelle("app/(admin)/admin/speaker/page.tsx");

  it("bleibt hinter dem Abschnitt „speakers“ und liest die Regel „neu“ aus der Datenbank, statt sie nachzurechnen", () => {
    const s = seite();
    assert.match(s, /await requireAdminSection\("speakers", "\/admin\/speaker"\)/);
    assert.match(s, /supabase\.rpc\("partner_created_speakers"\)/);
    assert.match(s, /\(partner \?\? \[\]\)\.filter\(\(p\) => p\.is_new\)/);
    for (const datei of [s, quelle("lib/neue-speaker.ts"), quelle("app/(admin)/admin/speaker/NeueSpeaker.tsx")]) {
      assert.doesNotMatch(code(datei), /pipeline_status\s*===?\s*["']lead["']/, "die Regel „neu“ gehört in die Datenbank");
      assert.doesNotMatch(code(datei), /owner_person_id\s*===?\s*null/, "die Regel „neu“ gehört in die Datenbank");
    }
  });

  it("zeigt die Reiter nur, wenn die Funktion antwortet — sonst bleibt die Seite, wie sie war", () => {
    const s = seite();
    assert.match(s, /const partner = partnerFehler \? null : \(\(partnerRows \?\? \[\]\) as PartnerSpeakerRow\[\]\);/);
    assert.match(s, /const zeigeNeue = liste === LISTE_NEU && partner !== null;/);
    assert.match(s, /partner === null\s+\? null/);
    assert.match(s, /\{reiter && <SectionTabs label=\{ta\.viewsLabel\} items=\{reiter\} \/>\}/);
    assert.equal(LISTE_NEU, "neu");
    // der Reiter „Neue Speaker“ führt auf ?liste=neu und trägt die Zahl im Namen (wie die Freigaben)
    assert.match(s, /href: `\/admin\/speaker\?liste=\$\{LISTE_NEU\}`, label: `\$\{ta\.viewNew\} \(\$\{neue\.length\}\)`/);
    assert.match(s, /label: `\$\{ta\.viewAll\} \(\$\{speakers\.length\}\)`, aktiv: !zeigeNeue/);
  });

  it("lädt die Auswahllisten der Zuteilung nur für die Liste „Neue Speaker“ und merkt, ob der Buddy gesetzt werden darf", () => {
    const s = seite();
    assert.match(s, /if \(zeigeNeue\) \{\s+const \[\{ data: managerRows \}, \{ data: kontaktRows, error: kontaktFehler \}\] = await Promise\.all\(\[\s+supabase\.rpc\("speaker_managers"\),\s+supabase\.rpc\("edition_contacts_admin"\),/);
    assert.match(s, /buddiesEditierbar = !kontaktFehler && kontaktRows !== null;/);
    assert.match(s, /\.filter\(\(k\) => k\.type === "speaker_buddy"\)/);
  });
});

describe("ADM-084: die Zuteilung in der Zeile — kein zweiter Schreibweg", () => {
  const komponente = () => quelle("app/(admin)/admin/speaker/NeueSpeaker.tsx");

  it("ruft nur die vorhandenen Aktionen auf und nie die Datenbank selbst", () => {
    const k = code(komponente());
    assert.match(k, /import \{ handoverSpeaker, setContacts, setPipeline, type AdminResult \} from "\.\/actions";/);
    assert.doesNotMatch(k, /\.rpc\(/, "kein eigener RPC-Aufruf");
    assert.doesNotMatch(k, /supabase/i, "kein eigener Datenbankzugriff");
    assert.match(k, /res = await setPipeline\(r\.profile_id, neu, null\);/);
    assert.match(k, /res = await handoverSpeaker\(r\.profile_id, neu \|\| null\);/);
    // `setContacts` setzt Lead **und** Buddy: der Lead muss mitgehen, sonst setzte die Wahl des Buddys ihn auf den Standard zurück
    assert.match(k, /res = await setContacts\(r\.profile_id, r\.lead_contact_id, neu \|\| null\);/);
  });

  it("bietet „abgesagt“ nicht an (es braucht einen Grund und steht im Detail) und zeigt jeden aktuellen Wert, auch wenn er nicht in der Liste steht", () => {
    const k = komponente();
    assert.match(k, /\.filter\(\(\[schluessel\]\) => schluessel !== "declined"\)/);
    assert.match(k, /function mitAktuellem\(optionen: SelectOption\[\], aktuell: string, beschriftung: string \| null\)/);
    assert.match(k, /if \(aktuell === "" \|\| optionen\.some\(\(o\) => o\.value === aktuell\)\) return optionen;/);
    // Betreuung und Buddy: der Name der Zeile wird als Beschriftung mitgegeben
    assert.match(k, /wert\(r, "owner"\),\s+r\.owner_name,/);
    assert.match(k, /wert\(r, "buddy"\),\s+r\.buddy_name,/);
  });

  it("wer den Buddy nicht setzen darf, sieht ihn als Text; Meldungen kommen als Toast, Fehler mit Schlüssel", () => {
    const k = komponente();
    assert.match(k, /\{buddiesEditierbar \? \(\s+<Select/);
    assert.match(k, /<span className=\{r\.buddy_name \? undefined : "text-muted"\}>\{r\.buddy_name \?\? t\.contactDefault\}<\/span>/);
    assert.match(k, /toast\("error", message\(res\.key\) \+ \(res\.detail \? ` \(\$\{res\.detail\}\)` : ""\)\);/);
    assert.match(k, /toast\("success", feld === "stand" \? t\.newSavedStand : feld === "owner" \? t\.newSavedOwner : t\.newSavedBuddy\);/);
    assert.match(k, /router\.refresh\(\);/);
  });

  it("die Zeit steht in Berliner Zeit, damit Server und Browser dasselbe schreiben; jede Auswahl hat einen Namen für Vorlesegeräte", () => {
    const k = komponente();
    assert.match(k, /timeZone: "Europe\/Berlin"/);
    assert.equal((k.match(/aria-label=\{`\$\{t\.(newColStand|colOwner|newColBuddy)\}: \$\{name\(r\)\}`\}/g) ?? []).length, 3);
  });
});

describe("ADM-084: das Menü", () => {
  it("das Layout fragt nur, wenn die Person den Abschnitt öffnen darf, startet den Aufruf vor den Freigaben und bleibt ohne Zähler heil", () => {
    const l = quelle("app/(admin)/layout.tsx");
    assert.match(l, /const neueSpeaker = offen\.has\("speakers"\) \? ladeNeueSpeakerZahl\(\) : null;/);
    assert.ok(l.indexOf("ladeNeueSpeakerZahl()") < l.indexOf("await ladeFreigabeZaehler()"), "die Zähler laufen nicht hintereinander");
    assert.match(l, /neueSpeakerNavigation\(await neueSpeaker, \(n\) => `\$\{n\} \$\{t\.adminSpeaker\.newCountLabel\}`\)/);
    assert.match(l, /if \(neu\) zusatz\[NEUE_SPEAKER_PFAD\] = neu;/);
    // die Freigaben bleiben, wie sie waren
    assert.match(l, /zusatz\[FREIGABE_PFAD\] = freigaben;/);
  });

  it("der Aufruf ist eine Zugabe: Fehler, fehlende Funktion und fehlendes Recht ergeben null", () => {
    const s = quelle("lib/neue-speaker-server.ts");
    assert.match(s, /^import "server-only";/m);
    assert.match(s, /supabase\.rpc\("new_speaker_count"\)/);
    assert.match(s, /return error \? null : parseNeueSpeakerZahl\(data\);/);
    assert.match(s, /\} catch \{\s+return null;/);
  });
});

describe("ADM-084: Wörterbücher", () => {
  const SCHLUESSEL = [
    "viewAll", "viewNew", "viewsLabel", "fromPartner", "partnerFallback", "badgeNew", "newCountLabel", "newLead", "newEmptyTitle",
    "newEmptyBody", "newColPartner", "newColSession", "newColStand", "newColBuddy", "newMore", "newSavedStand", "newSavedOwner",
    "newSavedBuddy",
  ];

  it("Deutsch und Englisch tragen dieselben Schlüssel, alle mit Text", () => {
    for (const sprache of ["de", "en"] as const) {
      const g = woerterbuch(sprache).adminSpeaker as Record<string, unknown>;
      for (const k of SCHLUESSEL) {
        assert.equal(typeof g[k], "string", `${sprache}.adminSpeaker.${k}`);
        assert.ok((g[k] as string).trim().length > 0, `${sprache}.adminSpeaker.${k} ist leer`);
      }
    }
  });

  it("die Platzhalter stehen in beiden Sprachen: {partner} in der Marke, {n} bei den weiteren Programmpunkten", () => {
    for (const sprache of ["de", "en"] as const) {
      const g = woerterbuch(sprache).adminSpeaker as Record<string, string>;
      assert.match(g.fromPartner, /\{partner\}/, sprache);
      assert.match(g.newMore, /\{n\}/, sprache);
    }
  });
});

describe("ADM-084: die Migration `v6_neue_speaker`", () => {
  const sql = () => migrationText("v6_neue_speaker");

  it("zwei additive Lesefunktionen: SECURITY DEFINER, STABLE, search_path gepinnt — keine Tabellenänderung, manager_speakers bleibt", () => {
    const c = code(sql());
    assert.match(c, /create or replace function partner_created_speakers\(p_edition_id uuid default null\)/);
    assert.match(c, /create or replace function new_speaker_count\(p_edition_id uuid default null\)/);
    assert.equal((c.match(/security definer/g) ?? []).length, 2);
    assert.equal((c.match(/\n\s+stable\n/g) ?? []).length, 2);
    assert.equal((c.match(/set search_path to 'public', 'extensions'/g) ?? []).length, 2);
    assert.doesNotMatch(c, /\b(alter table|create table|drop function|create or replace function manager_speakers)\b/i);
    assert.doesNotMatch(c, /\b(insert into|update|delete from)\b/i, "reine Lesefunktionen");
  });

  it("Tor und Zeilenfilter wie manager_speakers: Team und Stage Lead, nie Speaker, Partner oder Talent", () => {
    const c = code(sql());
    assert.match(c, /if not \(has_role\('speaker_manager'\) or has_role\('admin'\) or has_role\('area_lead_speaker'\) or has_role\('programme_team'\)\) then\s+raise exception 'not allowed' using errcode = '42501';/);
    assert.match(c, /and can_manage_speaker\(sp\.id\)/);
    // dasselbe Tor wie die Liste, nicht eine Abschrift
    const liste = readFileSync(new URL("../supabase/snapshot/functions/manager_speakers.sql", import.meta.url), "utf8");
    assert.match(liste, /if not \(has_role\('speaker_manager'\) or has_role\('admin'\) or has_role\('area_lead_speaker'\) or has_role\('programme_team'\)\) then/);
    assert.match(liste, /and can_manage_speaker\(sp\.id\)/);
  });

  it("schließt Gäste, Abgesagte und Gelöschte aus und nimmt nur Partner-angelegte; „neu“ heißt Betreuung fehlt oder Stand lead", () => {
    const c = code(sql());
    assert.match(c, /and sp\.created_by_org_id is not null/);
    assert.match(c, /and not sp\.stage_guest/);
    assert.match(c, /and sp\.declined_at is null\s+and sp\.pipeline_status <> 'declined'/);
    assert.match(c, /and p\.deleted_at is null/);
    assert.match(c, /\(sp\.owner_person_id is null or sp\.pipeline_status = 'lead'\)\s+from speaker_profile sp/);
    // der Buddy zählt nicht
    assert.doesNotMatch(c, /buddy_contact_id is null/);
  });

  it("gibt keine E-Mail, kein Telefon und keine Notizen heraus", () => {
    const c = code(sql());
    const rueckgabe = c.slice(c.indexOf("returns table ("), c.indexOf("language plpgsql"));
    assert.ok(rueckgabe.length > 100);
    assert.doesNotMatch(rueckgabe, /mail|phone|telefon|note/i);
    assert.doesNotMatch(c, /person_email|internal_notes|\.phone/);
  });

  it("der Zähler ruft die Liste auf — ein Tor, eine Definition von „neu“", () => {
    const c = code(sql());
    assert.match(c, /return \(select count\(\*\)::integer from partner_created_speakers\(p_edition_id\) s where s\.is_new\);/);
  });

  it("die Regel steht im Funktionskommentar, nicht nur im Chat", () => {
    const c = sql();
    assert.match(c, /comment on function partner_created_speakers\(uuid\) is\s+'[^']*Betreuung fehlt ODER Pipeline-Stand ist noch lead/);
    assert.match(c, /comment on function new_speaker_count\(uuid\) is\s+'[^']*Betreuung fehlt ODER Stand noch lead/);
  });

  it("entzieht anon das Ausführen, lässt authenticated zu und endet mit der Härtung", () => {
    const c = code(sql());
    for (const f of ["partner_created_speakers", "new_speaker_count"]) {
      assert.match(c, new RegExp(`revoke execute on function ${f}\\(uuid\\) from public, anon;`));
      assert.match(c, new RegExp(`grant execute on function ${f}\\(uuid\\) to authenticated;`));
    }
    assert.match(c.trim(), /select harden_definer_functions\(\);$/);
  });

  it("der Datenbank-Test liegt dabei und ist in der README verzeichnet", () => {
    const t = quelle("supabase/tests/v6_neue_speaker.sql");
    assert.match(t, /99_auswertung/);
    assert.match(t, /set local role authenticated/);
    assert.match(quelle("supabase/tests/README.md"), /\| `v6_neue_speaker\.sql` \|/);
  });
});
