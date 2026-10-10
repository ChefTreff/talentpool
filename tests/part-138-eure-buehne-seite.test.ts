import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BUEHNE_GEBRANDET,
  BUEHNE_PFAD,
  BUEHNE_STAND,
  SPEAKER_FORMATE,
  buehnenName,
  buehnenReiter,
  buehnenReiterLinks,
  buehnenSessions,
  hatOeffnungsfenster,
  vomTeamEingetragen,
  type BuehnenZeile,
} from "@/components/partner/eure-buehne";

/**
 * PART-138 (Konrad & Leopold 05.10., K-84 08.10.), Teil 2 — „Eure Bühne“, die Seite. Teil 1 (Datenbank, 0293) belegt `tests/eure-buehne.test.ts`; hier stehen die Regeln,
 * die die Oberfläche selbst entscheidet: welche Reiter eine Organisation je Art ihrer Bühnen sieht, wo das Öffnungsfenster gilt, welche Programmpunkte der Reiter „Speaker“
 * zeigt — und dass diese Regeln mit der Datenbank übereinstimmen (die Listen werden aus dem Snapshot gelesen, nicht abgeschrieben).
 */
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const snapshot = (name: string) => src(`supabase/snapshot/functions/${name}.sql`);
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const code = (ts: string) => ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{?\/\/[^\n]*/g, "");
/** Alle Arten, die `stage.kind` kennt (0274, ADM-085), dazu „unbekannt“. */
const ARTEN = ["main", "branded", "booth", "masterclass", "interview_table", "side_event", null] as const;

/** Die Werte einer SQL-Liste `in ('a', 'b')` hinter einem Anker. */
function sqlListe(text: string, anker: RegExp): string[] {
  const m = anker.exec(text);
  assert.ok(m, `Liste nicht gefunden: ${anker}`);
  return m[1].split(",").map((x) => x.trim().replace(/'/g, ""));
}

describe("PART-138 Teil 2: Reiter je Art der Bühne", () => {
  const ALLE_AUS = { tabelle: false, gaeste: false, speaker: false };

  it("die Standbühne bringt Tabelle und Gäste, die gebrandete Bühne die Speaker, jede andere Fläche keinen Reiter", () => {
    assert.deepEqual(buehnenReiter([]), ALLE_AUS);
    assert.deepEqual(buehnenReiter([BUEHNE_STAND]), { tabelle: true, gaeste: true, speaker: false });
    assert.deepEqual(buehnenReiter([BUEHNE_GEBRANDET]), { tabelle: false, gaeste: false, speaker: true });
    assert.deepEqual(buehnenReiter([BUEHNE_STAND, BUEHNE_GEBRANDET]), { tabelle: true, gaeste: true, speaker: true });
    for (const art of ARTEN.filter((a) => a !== BUEHNE_STAND && a !== BUEHNE_GEBRANDET)) {
      assert.deepEqual(buehnenReiter([art]), ALLE_AUS, String(art));
    }
    // Eine Fläche anderer Art neben einer gebrandeten Bühne ändert nichts an deren Reiter.
    assert.deepEqual(buehnenReiter(["interview_table", BUEHNE_GEBRANDET, undefined]), { tabelle: false, gaeste: false, speaker: true });
  });

  it("die Leiste führt Kalender, Tabelle, Gäste, Speaker in dieser Reihenfolge — der Kalender steht immer da und allein ist keine Leiste", () => {
    const T = { board: "Kalender", table: "Tabelle", guests: "Gäste", speakers: "Speaker" };
    const alle = buehnenReiterLinks({ tabelle: true, gaeste: true, speaker: true }, T);
    assert.deepEqual(alle.map((i) => i.href), [BUEHNE_PFAD, `${BUEHNE_PFAD}/tabelle`, `${BUEHNE_PFAD}/gaeste`, `${BUEHNE_PFAD}/speaker`]);
    assert.deepEqual(alle.map((i) => i.label), ["Kalender", "Tabelle", "Gäste", "Speaker"]);
    assert.deepEqual(alle.map((i) => i.exact === true), [true, false, false, false], "nur der Kalender (Präfix aller anderen) ist `exact`");
    assert.deepEqual(buehnenReiterLinks(buehnenReiter([BUEHNE_GEBRANDET]), T).map((i) => i.href), [BUEHNE_PFAD, `${BUEHNE_PFAD}/speaker`]);
    assert.deepEqual(buehnenReiterLinks(buehnenReiter([BUEHNE_STAND]), T).map((i) => i.href), [BUEHNE_PFAD, `${BUEHNE_PFAD}/tabelle`, `${BUEHNE_PFAD}/gaeste`]);
    assert.deepEqual(buehnenReiterLinks(ALL_AUS_REITER(), T).map((i) => i.href), [BUEHNE_PFAD]);
    // Jeder Link hat eine Seite.
    for (const i of alle) {
      const unter = i.href.slice(BUEHNE_PFAD.length);
      assert.ok(existsSync(`app/(partner)${BUEHNE_PFAD}${unter}/page.tsx`), `${i.href} hat keine Seite`);
    }
    assert.match(src("app/(partner)/partner/buehne/BuehnenTabs.tsx"), /if \(items\.length < 2\) return null;/);
  });
});

function ALL_AUS_REITER() {
  return { tabelle: false, gaeste: false, speaker: false };
}

describe("PART-138 Teil 2: Öffnungsfenster und Name der Bühne", () => {
  it("das Fenster gilt auf Standbühne und gebrandeter Bühne — dieselbe Menge wie partner_booth_window in der Datenbank", () => {
    const db = sqlListe(snapshot("partner_booth_window"), /st\.kind in \(([^)]*)\)/);
    assert.deepEqual([...db].sort(), [BUEHNE_GEBRANDET, BUEHNE_STAND].sort());
    for (const art of ARTEN) assert.equal(hatOeffnungsfenster(art), db.includes(art ?? ""), String(art));
    assert.equal(hatOeffnungsfenster(undefined), false);
  });

  it("der Name trägt die Art, soweit es eine der beiden gibt", () => {
    const T = { kindBooth: "Standbühne", kindBranded: "Gebrandete Bühne" };
    assert.equal(buehnenName("Science Stage", "branded", T), "Science Stage (Gebrandete Bühne)");
    assert.equal(buehnenName("Stand 18", "booth", T), "Stand 18 (Standbühne)");
    assert.equal(buehnenName("  Science Stage ", "main", T), "Science Stage", "eine andere Art bleibt ohne Zusatz, der Name ist getrimmt");
    assert.equal(buehnenName("Science Stage", null, T), "Science Stage");
    assert.equal(buehnenName(null, "branded", T), "Gebrandete Bühne", "ohne Namen steht die Art");
    assert.equal(buehnenName("   ", "booth", T), "Standbühne");
    assert.equal(buehnenName(null, "main", T), "");
    assert.equal(buehnenName(undefined, undefined, T), "");
  });
});

describe("PART-138 Teil 2: Programmpunkte des Reiters „Speaker“", () => {
  const zeile = (o: Partial<BuehnenZeile> = {}): BuehnenZeile => ({
    stage_id: "b1",
    stage_name: "Science Stage",
    start_at: "2027-04-16T09:00:00Z",
    end_at: "2027-04-16T09:30:00Z",
    session_id: "s1",
    title_de: "Titel",
    title_en: "Title",
    format: "talk",
    publish_status: "draft",
    speakers: [],
    ...o,
  });
  const B1 = new Set(["b1"]);

  it("die Formate sind genau die, für die partner_add_speaker einen Speaker annimmt", () => {
    const db = sqlListe(snapshot("partner_add_speaker"), /v_se\.format not in \(([^)]*)\)/);
    assert.deepEqual([...SPEAKER_FORMATE].sort(), [...db].sort());
  });

  it("nur Programmpunkte der gegebenen Bühnen, mit Session, in einem Speaker-Format und nicht abgesagt", () => {
    const rows = [
      zeile({ session_id: "ok-talk" }),
      zeile({ session_id: "ok-keynote", format: "keynote", start_at: "2027-04-16T10:00:00Z", end_at: "2027-04-16T10:30:00Z" }),
      zeile({ session_id: "fremde-buehne", stage_id: "b2" }),
      zeile({ session_id: null }),
      zeile({ session_id: "ohne-format", format: null }),
      zeile({ session_id: "pause", format: "break" }),
      zeile({ session_id: "preis", format: "award" }),
      zeile({ session_id: "abgesagt", publish_status: "cancelled" }),
    ];
    assert.deepEqual(buehnenSessions(rows, B1).map((x) => x.sessionId), ["ok-talk", "ok-keynote"]);
    assert.deepEqual(buehnenSessions(rows, new Set(["b2"])).map((x) => x.sessionId), ["fremde-buehne"]);
    assert.deepEqual(buehnenSessions(rows, new Set()), []);
  });

  it("jeder Stand außer „abgesagt“ bleibt: Entwurf, in Prüfung, veröffentlicht, ohne Angabe", () => {
    for (const status of ["draft", "review", "published", null]) {
      assert.equal(buehnenSessions([zeile({ publish_status: status })], B1).length, 1, String(status));
    }
  });

  it("in der Reihenfolge des Programms — nach dem Zeitpunkt, nicht nach dem Text (Zeitzonen)", () => {
    const rows = [
      // 09:30 UTC steht im Text vor 11:00+02:00 (= 09:00 UTC), kommt zeitlich aber danach.
      zeile({ session_id: "spaeter", start_at: "2027-04-16T09:30:00Z", end_at: "2027-04-16T10:00:00Z" }),
      zeile({ session_id: "frueher", start_at: "2027-04-16T11:00:00+02:00", end_at: "2027-04-16T11:30:00+02:00" }),
      zeile({ session_id: "tag-danach", start_at: "2027-04-17T08:00:00Z", end_at: "2027-04-17T08:30:00Z" }),
    ];
    assert.deepEqual(buehnenSessions(rows, B1).map((x) => x.sessionId), ["frueher", "spaeter", "tag-danach"]);
    // Gleicher Beginn: stabil nach Kennung.
    const gleich = [zeile({ session_id: "b" }), zeile({ session_id: "a" })];
    assert.deepEqual(buehnenSessions(gleich, B1).map((x) => x.sessionId), ["a", "b"]);
  });

  it("Speaker ohne Moderation, mit Namen — fehlt der Name, steht ein Strich", () => {
    const sp = (person_id: string, role: string | null, first_name: string | null, last_name: string | null) => ({ person_id, role, first_name, last_name });
    const [x] = buehnenSessions(
      [
        zeile({
          speakers: [sp("p1", "speaker", "Ada", "Lovelace"), sp("p2", "moderator", "Mo", "Derator"), sp("p3", null, null, null), sp("p4", "speaker", "Nur", null)],
        }),
      ],
      B1,
    );
    assert.deepEqual(x.speakers, [
      { personId: "p1", name: "Ada Lovelace" },
      { personId: "p3", name: "—" },
      { personId: "p4", name: "Nur" },
    ]);
    assert.deepEqual(buehnenSessions([zeile({ speakers: null })], B1)[0].speakers, []);
  });

  it("die Zeile trägt, was die Karte braucht: Titel, Format, Stand, Zeit, Bühne", () => {
    const [x] = buehnenSessions([zeile({ session_id: "s9", title_de: "Deutsch", title_en: null, publish_status: "published" })], B1);
    assert.deepEqual(x, {
      sessionId: "s9",
      titleDe: "Deutsch",
      titleEn: null,
      format: "talk",
      publishStatus: "published",
      startAt: "2027-04-16T09:00:00Z",
      endAt: "2027-04-16T09:30:00Z",
      stageName: "Science Stage",
      speakers: [],
    });
  });

  it("wen das Team eingetragen hat, steht zusätzlich da — wen der Partner selbst eingetragen hat, nicht doppelt", () => {
    const sp = [
      { personId: "p1", name: "Ada Lovelace" },
      { personId: "p2", name: "Grace Hopper" },
      { personId: "p3", name: "Alan Turing" },
    ];
    assert.deepEqual(vomTeamEingetragen(sp, new Set(["p2"])), ["Ada Lovelace", "Alan Turing"]);
    assert.deepEqual(vomTeamEingetragen(sp, new Set(["p1", "p2", "p3"])), []);
    assert.deepEqual(vomTeamEingetragen(sp, new Set()), ["Ada Lovelace", "Grace Hopper", "Alan Turing"]);
    assert.deepEqual(vomTeamEingetragen([], new Set(["p1"])), []);
  });
});

describe("PART-138 Teil 2: die Seiten", () => {
  const seite = (p: string) => src(`app/(partner)/partner/buehne/${p}`);

  it("die Bühne bringt ihre Art mit (stage.kind), ohne my_partner_stages zu ändern", () => {
    const daten = seite("daten.ts");
    assert.match(daten, /\.from\("stage"\)\s+\.select\("id, kind"\)/);
    assert.match(daten, /kind: art\.get\(z\.stage_id\) \?\? null/);
    assert.match(daten, /const eigene = alle\.filter\(\(s\) => s\.org_id === orgId\);/);
    assert.match(daten, /reiter: buehnenReiter\(eigene\.map\(\(s\) => s\.kind\)\)/);
    assert.doesNotMatch(daten, /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
  });

  it("der Kalender rechnet das Fenster auch für die gebrandete Bühne, nennt die Art im Namen und reicht die Reiter durch", () => {
    const k = seite("page.tsx");
    assert.match(k, /hatOeffnungsfenster\(st\.kind\)/);
    assert.doesNotMatch(code(k), /st\.type === "partner_booth"/, "das Fenster hängt nicht mehr an der Standbühne allein");
    assert.match(k, /buehnenName\(s\.stage_name, s\.kind, t\.partnerStage\)/);
    assert.match(k, /reiter=\{reiter\}/);
    // Ohne Standbühne gibt es den Reiter „Gäste“ nicht: der Hinweis im Schubfach schickt zu den Speakern.
    assert.match(k, /reiter\.gaeste \? t\.partnerStage : \{ \.\.\.t\.partnerStage, guestNone: t\.partnerStage\.guestNoneBranded \}/);
    // Ohne Standbühne gibt es keine Tabelle, in der man „Veröffentlichen“ anfragt: die Karte sagt dann, wer veröffentlicht.
    assert.match(k, /reiter\.tabelle \? t\.partnerStage : \{ \.\.\.t\.partnerStage, releaseHint: t\.partnerStage\.releaseHintBranded \}/);
  });

  it("die Tabelle bleibt der Standbühne, die Gäste auch — beide mit denselben Reitern wie der Kalender", () => {
    const tabelle = seite("tabelle/page.tsx");
    assert.match(tabelle, /s\.type === "partner_booth"/);
    assert.match(tabelle, /const \{ eigene, reiter \} = await ladeBuehnen\(current\.org_id\);/);
    assert.equal((tabelle.match(/reiter=\{reiter\}/g) ?? []).length, 1, "eine Leiste, an zwei Stellen eingesetzt");
    assert.equal((tabelle.match(/\{tabs\}/g) ?? []).length, 2);
    const gaeste = seite("gaeste/page.tsx");
    assert.match(gaeste, /if \(!eigene\.some\(\(s\) => s\.kind === BUEHNE_STAND\)\) \{/);
    assert.match(gaeste, /reiter=\{reiter\}/);
  });

  it("der Reiter „Speaker“ liest das Programm der gebrandeten Bühne, mit den Bausteinen der Talk-Seite", () => {
    const s = seite("speaker/page.tsx");
    assert.match(s, /requireArea\("partner", `\$\{BASE\}\/speaker`\)/);
    assert.match(s, /eigene\.filter\(\(s\) => s\.kind === BUEHNE_GEBRANDET\)/);
    assert.match(s, /loadProgrammeTable\(\{/);
    assert.match(s, /buehnenSessions\(data\.rows, new Set\(gebrandet\.map\(\(s\) => s\.stage_id\)\)\)/);
    assert.match(s, /eigeneSpeaker=\{speakers\.filter\(\(sp\) => sp\.session_id === x\.sessionId\)\}/);
    assert.match(s, /mitBuehne=\{gebrandet\.length > 1\}/);
    // Stand, Rückgabe und Pflichtfelder je Programmpunkt kommen aus `partner_format_sessions`: seit 0315 (PART-148 B) steht dort auch die Session ohne Organisation auf der gebrandeten Bühne
    // (PART-148 c) — die Liste der Programmpunkte bleibt das Programm, denn es legt sie ohne Organisation an.
    assert.match(code(s), /supabase\.rpc\("partner_format_sessions", args\)/);
    assert.match(code(s), /detail=\{details\.get\(x\.sessionId\) \?\? null\}/);
    assert.doesNotMatch(code(s), /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
    // Die Karte nimmt die Bausteine der Talk-Seite und zeigt, wen das Team schon eingetragen hat.
    const karte = seite("speaker/SessionKarte.tsx");
    assert.match(karte, /<SpeakerHinzufuegen sessionId=\{x\.sessionId\}/);
    assert.match(karte, /<SpeakerTabelle speakers=\{eigeneSpeaker\}/);
    assert.match(karte, /vomTeamEingetragen\(x\.speakers, new Set\(eigeneSpeaker\.map\(\(sp\) => sp\.person_id\)\)\)/);
    assert.match(karte, /<SessionStatusBadge publishStatus=\{status\} returnNote=\{rueckgabeZeile\?\.return_note \?\? null\}/);
    assert.doesNotMatch(code(karte), /service_role|createSupabaseAdminClient|SUPABASE_SECRET/);
  });

  it("Programmpunkte der gebrandeten Bühne stehen nicht auch noch unter Talk — nur, wenn die Person die Bühne dort sieht", () => {
    const talk = src("app/(partner)/partner/talk/page.tsx");
    assert.match(talk, /for \(const b of \(await ladeBuehnen\(current\.org_id\)\)\.eigene\) if \(b\.kind === BUEHNE_GEBRANDET\) eigeneBuehnen\.add\(b\.stage_id\);/);
    assert.match(talk, /!\(x\.stage_id && eigeneBuehnen\.has\(x\.stage_id\)\)/);
  });
});

describe("PART-138 Teil 2: Texte", () => {
  const woerterbuch = (sprache: string) => JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;

  it("Menü, Titel und Fensterüberschrift heißen „Eure Bühne“ — die Standbühne steht nur noch als Art", () => {
    const de = woerterbuch("de");
    assert.equal(de.partner.navStage, "Eure Bühne");
    assert.equal(de.partnerStage.title, "Eure Bühne");
    assert.doesNotMatch(de.partnerStage.windowTitle, /Standbühne/);
    assert.equal(de.partnerStage.kindBooth, "Standbühne");
    assert.equal(de.partnerStage.kindBranded, "Gebrandete Bühne");
    const en = woerterbuch("en");
    assert.equal(en.partner.navStage, "Your stage");
    assert.equal(en.partnerStage.title, "Your stage");
    assert.doesNotMatch(en.partnerStage.windowTitle, /stand stage/i);
    assert.equal(en.partnerStage.kindBooth, "Stand stage");
    assert.equal(en.partnerStage.kindBranded, "Branded stage");
  });

  it("jeder Text der neuen Seite steht in beiden Wörterbüchern, die deutschen in Ihr-Ansprache", () => {
    const dateien = ["speaker/page.tsx", "page.tsx", "BuehnenTabs.tsx", "gaeste/page.tsx", "tabelle/page.tsx"].map((d) => src(`app/(partner)/partner/buehne/${d}`)).join("\n");
    const karte = src("app/(partner)/partner/buehne/speaker/SessionKarte.tsx");
    // `stage` ist in der Karte `t.partnerStage`, `s` ist `t.partnerTalk`.
    const stage = [
      ...new Set([...dateien.matchAll(/\bt\.partnerStage\.([a-zA-Z]+)/g), ...karte.matchAll(/\bstage\.([a-zA-Z]+)/g)].map((m) => m[1])),
    ];
    assert.ok(stage.length >= 12, `nur ${stage.length} Schlüssel gefunden`);
    assert.ok(stage.includes("noTitle") && stage.includes("speakersByTeam"), "die Schlüssel der Karte fehlen in der Suche");
    const talk = [...new Set([...karte.matchAll(/\bs\.([a-zA-Z]+)/g)].map((m) => m[1]))];
    assert.ok(talk.includes("slotLabel") && talk.includes("noSpeakerYet") && talk.includes("speakersNoteOwn"), "die Schlüssel der Speaker-Liste fehlen in der Suche");
    for (const sprache of ["de", "en"]) {
      const w = woerterbuch(sprache);
      for (const key of stage) assert.equal(typeof w.partnerStage[key], "string", `${sprache}: partnerStage.${key}`);
      for (const key of talk) assert.equal(typeof w.partnerTalk[key], "string", `${sprache}: partnerTalk.${key}`);
    }
    const de = woerterbuch("de").partnerStage;
    for (const key of ["guestNoneBranded", "speakersByTeam", "speakersEmptyBody", "speakersHint", "speakersLead", "speakersNoStageBody"]) {
      assert.doesNotMatch(de[key], /\bSie\b|\bIhr\b|\bIhre\b/, key);
    }
    assert.match(de.speakersByTeam, /\{namen\}/);
    assert.match(woerterbuch("en").partnerStage.speakersByTeam, /\{namen\}/);
  });
});

describe("PART-138 Teil 2: Testdaten für Konrads Konto", () => {
  const skript = src("scripts/testdaten-konrad.mjs");
  const funktion = (name: string) => {
    const i = skript.indexOf(`async function ${name}(`);
    assert.ok(i >= 0, `${name} fehlt`);
    return code(skript.slice(i, skript.indexOf("\n}\n", i)));
  };

  it("der Schritt eurebuehne ist angemeldet und im Kopf des Skripts erklärt", () => {
    assert.match(skript, /eurebuehne: eureBuehneSchritt,/);
    assert.match(skript, /--apply --nur=eurebuehne\s+\(PART-138 Teil 2:/);
  });

  it("zwei Programmpunkte ohne Organisation auf der gebrandeten TEST-Bühne, im Fenster, mit einem unbestätigten Team-Speaker", () => {
    const f = funktion("eureBuehneSchritt");
    assert.match(f, /\.eq\("slug", GEBRANDET_SLUG\)/);
    assert.match(f, /zuerst --nur=partnerslots/);
    assert.match(f, /format: "talk"/);
    assert.match(f, /publish_status: "draft"/);
    // Angelegt wird ohne Organisation — so legt das Team die Session an (PART-148); erst das Zurücksetzen (PART-148 c) nimmt eine gespeicherte Organisation wieder weg.
    const anlage = f.slice(0, f.indexOf("Veröffentlichung zurückgesetzt"));
    assert.ok(anlage.length > 200 && anlage.includes("session\").insert("), "die Anlage steht vor dem Zurücksetzen");
    assert.doesNotMatch(anlage, /partner_org_id|host_org_id/, "so legt das Team die Session an: ohne Organisation (PART-148)");
    // Ein bestätigter Speaker sperrt `partner_add_speaker` (slot_locked) — der Team-Speaker muss unbestätigt sein.
    assert.match(f, /role: "speaker", confirmed: false/);
    assert.doesNotMatch(f, /confirmed: true/);
    // Beide Programmpunkte liegen am ersten Tag in den Öffnungszeiten der Bühne aus dem Schritt partnerslots.
    const fenster = /\{ tag: tage\[0\], von: "(\d\d:\d\d)", bis: "(\d\d:\d\d)" \}/.exec(skript);
    assert.ok(fenster, "Öffnungszeit des ersten Tages in partnerslotsSchritt nicht gefunden");
    const minuten = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    const punkte = [...skript.matchAll(/\{ titel: `\$\{PREFIX\}Eure Bühne: [^`]+`, von: "(\d\d:\d\d)", bis: "(\d\d:\d\d)", teamSpeaker: (true|false) \}/g)];
    assert.equal(punkte.length, 2);
    assert.deepEqual(punkte.map((m) => m[3]), ["true", "false"], "einer mit, einer ohne Team-Speaker");
    for (const [, von, bis] of punkte) {
      assert.ok(minuten(von) >= minuten(fenster[1]) && minuten(bis) <= minuten(fenster[2]), `${von}–${bis} liegt nicht in ${fenster[1]}–${fenster[2]}`);
      assert.ok(minuten(bis) > minuten(von));
    }
    // Die beiden liegen nicht übereinander (`slot_no_overlap`).
    assert.ok(minuten(punkte[0][2]) <= minuten(punkte[1][1]));
  });

  it("die Personen sind Konrads eigenes Postfach (Plus-Adressen) und `--remove` nimmt beide mit — auch die, die Konrad selbst anlegt", () => {
    assert.match(skript, /const eureBuehneTeamAdresse = \(\) => email\.replace\("@", "\+zztest-eurebuehne-team@"\);/);
    assert.match(skript, /const eureBuehneEintragAdresse = \(\) => email\.replace\("@", "\+zztest-eurebuehne-1@"\);/);
    const i = skript.indexOf('"TEST-Speaker von „Eure Bühne“ entfernt');
    assert.ok(i >= 0, "Aufräumschritt fehlt");
    const block = skript.slice(i, skript.indexOf("});", i));
    assert.match(block, /\.in\("email", \[eureBuehneTeamAdresse\(\), eureBuehneEintragAdresse\(\)\]\)/);
    assert.match(block, /\.eq\("first_name", "TEST"\)\.is\("auth_user_id", null\)/, "nie eine Person mit Konto");
    // Vor der Bühne und nach den Sessions — erst die Zuordnungen, dann die Person.
    assert.ok(skript.indexOf('"Testsessions und Bewerbungen entfernt"') < i);
    assert.ok(i < skript.indexOf('"Gebrandete TEST-Bühne entfernt'));
  });

  it("Doku: Testdaten-Absatz und Zeile im Testleitfaden nennen den Weg", () => {
    assert.match(src("docs/testdaten-konrad.md"), /`--apply --nur=eurebuehne` \(braucht `partner` und `partnerslots`/);
    assert.match(src("docs/team-testleitfaden.md"), /„Eure Bühne“, Reiter „Speaker“ \(PART-138\)/);
  });
});
