import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PFLICHT_BLOECKE,
  STUFEN,
  alsNaechstes,
  aufraeumen,
  blockMarken,
  hauptaktion,
  naechstePflichten,
  warNachZusage,
} from "@/app/(speaker-leads)/speaker-leads/phase";
import { entwurfGeaendert, fensterEntwurf } from "@/app/(speaker-leads)/speaker-leads/entwurf";
import { einordnungEntwurf } from "@/lib/speaker/einordnung";
import type { ManagedSpeaker } from "@/app/(speaker-leads)/speaker-leads/types";

/**
 * LEAD-055 (Konrad und Paulina 05.10.: das Personen-Fenster sei „noch sehr unübersichtlich“; Entwurf von Design,
 * `docs/design-vorschlaege-2026-10-05.md`): Oben der Kopf mit **einer** Hauptaktion, der Stufenleiste und einer Zeile Kontext,
 * darunter fünf Blöcke in fester Reihenfolge. Hier steht, was ohne Browser feststeht: die Regeln, aus denen Hauptaktion,
 * Marken und „Als Nächstes“ entstehen (alles aus `naechstePflichten`), und was der Quelltext des Fensters zusagt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));

type Zeile = Parameters<typeof naechstePflichten>[0] & Pick<ManagedSpeaker, "next_task" | "confirmed_at">;
const zeile = (x: Partial<Zeile> = {}): Zeile => ({
  pipeline_status: "confirmed",
  stage_guest: false,
  invited_at: "2026-10-01T10:00:00Z",
  hospitality_status: "eligible",
  travel_costs_covered: false,
  travel_costs_approved: false,
  sessions: [
    { session_id: "s1", title_de: "Keynote", title_en: "Keynote", publish_status: "draft", start_at: null, stage_name: "Mainstage" },
  ],
  next_task: null,
  confirmed_at: "2026-10-01T10:00:00Z",
  ...x,
});
/** Alles erledigt außer den genannten Pflichten. */
const mitPflichten = (offen: ("invite" | "hospitality" | "travel" | "session")[]): Zeile =>
  zeile({
    invited_at: offen.includes("invite") ? null : "2026-10-01T10:00:00Z",
    hospitality_status: offen.includes("hospitality") ? "none" : "eligible",
    travel_costs_covered: offen.includes("travel"),
    travel_costs_approved: false,
    sessions: offen.includes("session") ? [] : zeile().sessions,
  });

describe("LEAD-055: die Stufen und die Phase", () => {
  it("die Leiste hat sieben Stufen von Lead bis Teilgenommen — „Abgesagt“ ist ein Ergebnis, keine Stufe", () => {
    assert.deepEqual(STUFEN, ["lead", "contacted", "confirmed", "onboarded", "ready", "published", "attended"]);
  });

  it("nach der Zusage sind auch die, die nach der Zusage abgesagt haben — vor der Zusage Abgesagte nicht", () => {
    assert.equal(warNachZusage({ pipeline_status: "confirmed", confirmed_at: "2026-10-01T10:00:00Z" }), true);
    assert.equal(warNachZusage({ pipeline_status: "attended", confirmed_at: null }), true);
    assert.equal(warNachZusage({ pipeline_status: "lead", confirmed_at: null }), false);
    assert.equal(warNachZusage({ pipeline_status: "declined", confirmed_at: "2026-10-01T10:00:00Z" }), true);
    assert.equal(warNachZusage({ pipeline_status: "declined", confirmed_at: null }), false);
    // zurück auf „kontaktiert“ gesetzt: `confirmed_at` steht noch, aber die Person ist nicht abgesagt
    assert.equal(warNachZusage({ pipeline_status: "contacted", confirmed_at: "2026-10-01T10:00:00Z" }), false);
  });
});

describe("LEAD-055: die Hauptaktion — das Verb des nächsten Schritts, die erste, die diese Rolle erledigen kann", () => {
  it("vor der Zusage: Lead ⇒ als kontaktiert markieren, Kontaktiert ⇒ Hat bestätigt — für jede Rolle", () => {
    for (const team of [true, false]) {
      assert.equal(hauptaktion(zeile({ pipeline_status: "lead" }), team), "contact");
      assert.equal(hauptaktion(zeile({ pipeline_status: "contacted" }), team), "confirm");
    }
  });

  it("nach der Zusage: Einladung zuerst — die darf jede Betreuung", () => {
    for (const team of [true, false]) assert.equal(hauptaktion(mitPflichten(["invite", "hospitality", "travel", "session"]), team), "invite");
  });

  it("Hospitality, Reisekosten und Programm nur für das Team; wer nichts erledigen kann, bekommt keine Hauptaktion", () => {
    assert.equal(hauptaktion(mitPflichten(["hospitality", "travel", "session"]), true), "hospitality");
    assert.equal(hauptaktion(mitPflichten(["hospitality", "travel", "session"]), false), null);
    assert.equal(hauptaktion(mitPflichten(["travel", "session"]), true), "travel");
    assert.equal(hauptaktion(mitPflichten(["session"]), true), "session");
    assert.equal(hauptaktion(mitPflichten(["session"]), false), null);
  });

  it("nichts offen, abgesagt oder Gast eines Partners: keine Hauptaktion", () => {
    assert.equal(hauptaktion(mitPflichten([]), true), null);
    assert.equal(hauptaktion(zeile({ pipeline_status: "declined" }), true), null);
    assert.equal(hauptaktion(zeile({ pipeline_status: "declined", invited_at: null }), true), null);
    assert.equal(hauptaktion(zeile({ stage_guest: true, invited_at: null, hospitality_status: "none", sessions: [] }), true), null);
  });

  it("die Reihenfolge der Pflichten ist die von `naechstePflichten` — die eine Quelle", () => {
    const s = mitPflichten(["invite", "hospitality", "travel", "session"]);
    assert.deepEqual(naechstePflichten(s), ["invite", "hospitality", "travel", "session"]);
    // die Hauptaktion nimmt die erste, die die Rolle kann: ohne Einladung zuerst die Einladung, danach die erste Team-Pflicht
    assert.equal(hauptaktion({ ...s, invited_at: "2026-10-01T10:00:00Z" }, true), "hospitality");
  });
});

describe("LEAD-055: die Marken der Blöcke", () => {
  it("ohne offene Pflicht ist jeder Block „erledigt“", () => {
    for (const b of PFLICHT_BLOECKE) assert.deepEqual(blockMarken([])[b], { zustand: "erledigt", n: 0 });
  });

  it("der erste Block mit offener Pflicht ist die „Nächste Pflicht“, jeder weitere „offen“ — mit Zahl, wenn es mehrere sind", () => {
    const m = blockMarken(["invite", "hospitality", "travel", "session"]);
    assert.deepEqual(m.onboarding, { zustand: "naechste", n: 1 });
    assert.deepEqual(m.hospitality, { zustand: "offen", n: 2 });
    assert.deepEqual(m.programm, { zustand: "offen", n: 1 });
  });

  it("die Einladung gehört zu Onboarding, Hospitality und Reisekosten zu Hospitality, die Session zu Programm", () => {
    const m = blockMarken(["hospitality", "travel"]);
    assert.deepEqual(m, {
      onboarding: { zustand: "erledigt", n: 0 },
      hospitality: { zustand: "naechste", n: 2 },
      programm: { zustand: "erledigt", n: 0 },
    });
    assert.equal(blockMarken(["session"]).programm.zustand, "naechste");
    assert.equal(blockMarken(["invite"]).onboarding.zustand, "naechste");
  });

  it("die Reihenfolge der Blöcke ist fest: Onboarding, Hospitality, Programm", () => {
    assert.deepEqual(PFLICHT_BLOECKE, ["onboarding", "hospitality", "programm"]);
  });

  it("nach einer Absage nach der Zusage: „Aufräumen“, wo noch etwas hängt, das das Fenster belegen kann", () => {
    assert.deepEqual(aufraeumen(zeile({ hospitality_status: "booked" })), { onboarding: false, hospitality: true, programm: true });
    assert.deepEqual(aufraeumen(zeile({ hospitality_status: "none", sessions: [] })), { onboarding: false, hospitality: false, programm: false });
    assert.equal(aufraeumen(zeile({ hospitality_status: "none", travel_costs_approved: true, sessions: [] })).hospitality, true);
    // Ticket und Fahrt kennt `manager_speakers` nicht: Onboarding trägt nie eine Marke
    assert.equal(aufraeumen(zeile({ hospitality_status: "booked" })).onboarding, false);
  });
});

describe("LEAD-055: „Als Nächstes“ im Kopf", () => {
  const aufgabe = { id: "t1", body: "Nachfassen", due_on: "2026-10-09", assignee_person_id: null, assignee_name: null };

  it("vor der Zusage die früheste offene Aufgabe des Verlaufs, sonst nichts", () => {
    assert.deepEqual(alsNaechstes(zeile({ pipeline_status: "contacted", next_task: aufgabe })), { art: "aufgabe" });
    assert.deepEqual(alsNaechstes(zeile({ pipeline_status: "lead" })), { art: "nichts" });
  });

  it("nach der Zusage die erste offene Pflicht — erst wenn keine mehr offen ist, wieder die Aufgabe", () => {
    assert.deepEqual(alsNaechstes({ ...mitPflichten(["hospitality", "session"]), next_task: aufgabe }), { art: "pflicht", pflicht: "hospitality" });
    assert.deepEqual(alsNaechstes({ ...mitPflichten([]), next_task: aufgabe }), { art: "aufgabe" });
    assert.deepEqual(alsNaechstes({ ...mitPflichten([]), next_task: null }), { art: "nichts" });
  });

  it("nach einer Absage steht die Absage da, nicht „Als Nächstes“", () => {
    assert.deepEqual(alsNaechstes(zeile({ pipeline_status: "declined", next_task: aufgabe })), { art: "abgesagt" });
  });

  it("Gäste von Partnern haben keine Pflichten — nur die Aufgabe, falls es eine gibt", () => {
    assert.deepEqual(alsNaechstes(zeile({ stage_guest: true, invited_at: null, next_task: aufgabe })), { art: "aufgabe" });
  });
});

describe("LEAD-055: Änderungen verwerfen? — was beim Schließen verloren ginge", () => {
  const profil = {
    speaker_type: "panelist", job_title: "Head of Talent", organization_name: "Beispiel GmbH", internal_notes: null,
    reception_eligible: false, travel_costs_covered: false, pass_type: "speaker", lounge_access: false,
    hotel_tier: "standard", hospitality_status: "none",
    category: "technology", topic_cluster: null, topic_role: null, priority: "a", recommended_format: null, contact_via: null,
    outreach_channel: null, stage_candidates: [{ stage_id: "b1", name: "Mainstage" }, { stage_id: "b2", name: "Side" }],
  } as unknown as ManagedSpeaker;
  const vorher = () => fensterEntwurf(profil);
  const e0 = () => einordnungEntwurf(profil);

  it("unverändert: nichts geht verloren; null wird zur leeren Zeichenkette und zählt nicht als Änderung", () => {
    assert.equal(vorher().internal_notes, "");
    assert.equal(entwurfGeaendert(vorher(), vorher(), true, e0(), e0()), false);
  });

  it("ein geändertes Feld, auch in einem zugeklappten Block, ist eine Änderung", () => {
    assert.equal(entwurfGeaendert(vorher(), { ...vorher(), job_title: "CEO" }, false, e0(), e0()), true);
    assert.equal(entwurfGeaendert(vorher(), { ...vorher(), internal_notes: "Rückruf" }, false, e0(), e0()), true);
    assert.equal(entwurfGeaendert(vorher(), { ...vorher(), travel_costs_covered: true }, false, e0(), e0()), true);
  });

  it("Team-Felder zählen nur für das Team — der Stage Lead sieht und speichert sie nie", () => {
    const entwurf = { ...vorher(), hotel_tier: "vip", lounge_access: true };
    assert.equal(entwurfGeaendert(vorher(), entwurf, true, e0(), e0()), true);
    assert.equal(entwurfGeaendert(vorher(), entwurf, false, e0(), e0()), false);
  });

  it("die Einordnung und die Bühnen in Frage zählen mit; nur die Reihenfolge der Bühnen nicht", () => {
    assert.equal(entwurfGeaendert(vorher(), vorher(), true, e0(), { ...e0(), topic_role: "KI" }), true);
    assert.equal(entwurfGeaendert(vorher(), vorher(), true, e0(), { ...e0(), stage_ids: ["b1"] }), true);
    assert.equal(entwurfGeaendert(vorher(), vorher(), true, e0(), { ...e0(), stage_ids: ["b2", "b1"] }), false);
    // ein Leerzeichen am Rand ist keine Änderung (`update_speaker` bekäme es getrimmt)
    assert.equal(entwurfGeaendert(vorher(), vorher(), true, e0(), { ...e0(), topic_role: "  " }), false);
  });
});

describe("LEAD-055: der gemeinsame Kopf (Quelltext)", () => {
  const k = () => quelle("components/speaker/SpeakerKopf.tsx");

  it("Fenster und Admin-Detail nehmen denselben Kopf — Aktionen, Texte und Regeln gibt es einmal", () => {
    assert.match(quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx"), /import \{ SpeakerKopf, type KopfErgebnis \} from "@\/components\/speaker\/SpeakerKopf";/);
    assert.match(quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx"), /<SpeakerKopf\b/);
    assert.match(quelle("app/(admin)/admin/speaker/[id]/Detail.tsx"), /<SpeakerKopf\b/);
  });

  it("nimmt seine Bausteine aus dem Kit: Stufenleiste, Menü, Knöpfe", () => {
    assert.match(k(), /import \{ Stufenleiste \} from "@\/components\/ui\/Stufenleiste";/);
    assert.match(k(), /import \{ Menu, MenuItem, MenuSeparator \} from "@\/components\/ui\/Menu";/);
    assert.match(k(), /import \{ Button, ButtonLink \} from "@\/components\/ui\/Button";/);
  });

  it("eine Hauptaktion (primär), daneben „Weitere Aktionen“ als Menü im hellen Ton", () => {
    const text = k();
    assert.match(text, /const aktion = hauptaktion\(speaker, team\);/);
    assert.match(text, /<Menu ton="hell" label=\{t\.moreActions\} trigger=\{<span>\{t\.moreActions\}<\/span>\}>/);
    // genau ein Knopf ohne `variant` in der Aktionszeile: die Hauptaktion
    const zeileAktion = text.slice(text.indexOf("{/* … die eine Hauptaktion"), text.indexOf("<Menu ton="));
    assert.equal((zeileAktion.match(/<Button\b/g) ?? []).length, 1);
    assert.doesNotMatch(zeileAktion, /variant=/);
    assert.match(zeileAktion, /loading=\{pending\}/);
  });

  it("die Menüeinträge gibt es nur, wo die Rolle sie darf — die Einladung nie für Gäste und nie, wenn der Partner alles verwaltet", () => {
    const text = k();
    assert.match(text, /\{darfWeitergeben && \(\s+<MenuItem/);
    assert.match(text, /const darfErneutEinladen = !gast && !speaker\.mail_via && nachZusage && !abgesagt && Boolean\(speaker\.invited_at\);/);
    assert.match(text, /\{!abgesagt && \(\s+<>\s+<MenuSeparator \/>/);
  });

  it("Absage, Stand ändern und Weitergeben laufen über ein Panel unter der Zeile — kein Dialog über dem Dialog", () => {
    const text = k();
    assert.match(text, /\{panel === "absage" && \(/);
    assert.match(text, /\{panel === "stand" && \(/);
    assert.match(text, /\{panel === "weitergeben" && \(/);
    assert.match(text, /aktionen\.setPipeline\("declined", grund\)/);
    assert.match(text, /aktionen\.setPipeline\(neuerStand\)/);
    assert.match(text, /aktionen\.handover\(nachfolge \|\| null\)/);
    // „Stand ändern“ bietet die Absage nicht an — sie hat einen eigenen Eintrag mit Grund
    assert.match(text, /s !== speaker\.pipeline_status && s !== "declined"/);
    // vor der Zusage nur die Stände davor
    assert.match(text, /\(nachZusage \|\| STAENDE_VOR_ZUSAGE\.includes\(s\)\)/);
  });

  it("die Betreuung leeren darf nur, wer es darf (Admin): sonst ist ein gewählter Empfänger Pflicht", () => {
    const text = k();
    assert.match(text, /const weitergabeBereit = ohneBetreuung \? nachfolge !== aktuellerOwner : nachfolge !== "";/);
    assert.match(text, /placeholder=\{ohneBetreuung \? t\.withoutOwner : common\.choose\}/);
  });

  it("die Stufenleiste liest nur; eine Absage hält sie an", () => {
    const text = k();
    assert.match(text, /<Stufenleiste[\s\S]*?aktuell=\{speaker\.pipeline_status\}\s+ende=\{abgesagt \? t\.stageEnded : undefined\}\s+\/>/);
    assert.match(text, /schritte=\{STUFEN\.map\(\(s\) => \(\{ key: s, label: labels\.pipeline\[s\] \?\? s \}\)\)\}/);
  });

  it("Kontext: Betreuung, „Als Nächstes“ (Pflicht, Aufgabe mit Frist) oder die Absage, E-Mail oder der Satz „Kontakt nicht sichtbar“", () => {
    const text = k();
    assert.match(text, /const naechstes = alsNaechstes\(speaker\);/);
    assert.match(text, /naechstes\.art === "abgesagt"/);
    assert.match(text, /t\.declinedLine\.replace\("\{date\}", datum\(speaker\.declined_at\)\)/);
    assert.match(text, /t\[`duty_\$\{naechstes\.pflicht\}`\]/);
    assert.match(text, /nachZusage && !gast \? t\.dutiesDone : t\.noNextStep/);
    assert.match(text, /\{speaker\.email \? \(/);
    assert.match(text, /t\.contactHidden/);
  });

  it("die Zusage nennt den Namen im Toast (der Platzhalter blieb im Fenster bisher stehen)", () => {
    assert.match(k(), /t\.confirmedMoved\.replace\("\{name\}", name\)/);
  });

  it("die Einladung fragt der Aufrufer — der Kopf löst sie nie selbst aus", () => {
    const text = k();
    assert.match(text, /else if \(a === "invite"\) onEinladen\(\);/);
    assert.match(text, /\{darfErneutEinladen && <MenuItem onSelect=\{onEinladen\}>\{t\.inviteAgain\}<\/MenuItem>\}/);
    // (in Kommentaren darf der Name stehen — gemeint ist der Code)
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /inviteSpeaker|invite_speaker/);
  });

  it("alle Texte stehen in DE und EN — auch die neuen Schlüssel des Kopfes", () => {
    const text = k();
    const direkt = [...text.matchAll(/\bt\.([A-Za-z]\w*)/g)].map((m) => m[1]).filter((x) => x !== "replace");
    const ueberAktion = [...text.matchAll(/^\s+\w+: "(action\w+|confirmAction)",$/gm)].map((m) => m[1]);
    const schluessel = [...new Set([...direkt, ...ueberAktion])];
    assert.ok(schluessel.length > 30, "der Kopf liest viele Texte");
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).leads;
      assert.deepEqual(schluessel.filter((x) => w[x] === undefined), [], `${sprache}.leads: fehlende Texte`);
    }
    // die Überfällig-Marke und die Frist kommen aus dem Verlauf
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).speakerVerlauf;
      for (const x of ["overdue", "dueToday", "dueOn"]) assert.ok(w[x], `${sprache}.speakerVerlauf.${x}`);
    }
  });
});

describe("LEAD-055: das Fenster (Quelltext)", () => {
  const f = () => quelle("app/(speaker-leads)/speaker-leads/SpeakerFenster.tsx");

  it("nimmt seine Bausteine aus dem Kit: Block, Porträt, InfoList, Rückfrage", () => {
    for (const [name, pfad] of [
      ["Block", "@/components/ui/Block"],
      ["PortraitShape", "@/components/ui/PortraitShape"],
      ["InfoList", "@/components/ui/InfoList"],
    ]) assert.match(f(), new RegExp(`import \\{ ${name} \\} from "${pfad.replace(/\//g, "\\/")}";`), name);
    assert.match(f(), /import \{[^}]*\bConfirmDialog\b[^}]*\} from "@\/components\/ui\/Modal";/);
  });

  it("fünf Blöcke in fester Reihenfolge, jeder mit Überschrift der Ebene 3 unter dem Namen", () => {
    const text = f();
    const ids = ["fenster-grunddaten", "fenster-pipeline", "fenster-onboarding", "fenster-hospitality", "fenster-programm"];
    const stellen = ids.map((id) => text.indexOf(`id="${id}"`));
    assert.ok(stellen.every((s) => s > 0), "alle fünf Blöcke stehen im Fenster");
    assert.deepEqual([...stellen].sort((a, b) => a - b), stellen, "die Reihenfolge ist fest");
    assert.equal((text.match(/<Block\b/g) ?? []).length, 5);
    assert.equal((text.match(/ebene="h3"/g) ?? []).length, 5);
    assert.match(text, /<h2 className="ct-h3 text-ink">\{name\}<\/h2>/);
  });

  it("Grunddaten und Pipeline stehen immer da; Onboarding und Hospitality nie für Gäste, Programm für alle nach der Zusage", () => {
    const text = f();
    assert.match(text, /<Block id="fenster-grunddaten"/);
    assert.match(text, /<Block id="fenster-pipeline" ebene="h3" titel=\{t\.blockPipeline\} kurz=\{kurzPipeline\} offen=\{!nachZusage\}>/);
    assert.match(text, /\{nachZusage && !gast && \(\s+<Block\s+id="fenster-onboarding"/);
    assert.match(text, /\{nachZusage && !gast && \(\s+<Block\s+id="fenster-hospitality"/);
    assert.match(text, /\{nachZusage && \(\s+<Block\s+id="fenster-programm"/);
  });

  it("die Marken lesen aus `blockMarken`; Gäste tragen keine, nach einer Absage steht „Aufräumen“", () => {
    const text = f();
    assert.match(text, /const marken = blockMarken\(pflichten\);/);
    assert.match(text, /if \(gast\) return undefined;/);
    assert.match(text, /if \(abgesagt\) return haengt\[b\] \? \{ text: t\.markCleanup, ton: "warning" \} : undefined;/);
    assert.match(text, /m\.zustand === "naechste"\) return \{ text: t\.markNext, ton: "accent" \}/);
    assert.match(text, /\{ text: m\.n > 1 \? t\.markOpenN\.replace\("\{n\}", String\(m\.n\)\) : t\.markOpen, ton: "warning" \}/);
    // offen ist der Block der nächsten Pflicht — nie nach einer Absage, nie für Gäste
    assert.match(text, /const offenVon = \(b: PflichtBlock\) => !gast && !abgesagt && marken\[b\]\.zustand === "naechste";/);
  });

  it("die Pipeline ist vor der Zusage offen und danach zu; Grunddaten sind zu", () => {
    const text = f();
    assert.match(text, /offen=\{!nachZusage\}/);
    const grunddaten = text.slice(text.indexOf('<Block id="fenster-grunddaten"'), text.indexOf(">", text.indexOf('<Block id="fenster-grunddaten"')));
    assert.doesNotMatch(grunddaten, /offen=/);
  });

  it("der Kopf bekommt Rolle, Aktionen und Rückfrage vom Fenster: die Einladung fragt vorher und nennt die Adresse", () => {
    const text = f();
    assert.match(text, /<SpeakerKopf[\s\S]*?team=\{isTeam\}[\s\S]*?onRun=\{fuehreAus\}\s+onEinladen=\{\(\) => setEinladungFrage\(true\)\}/);
    assert.match(text, /blockPrefix="fenster-"/);
    assert.match(text, /body=\{speaker\.email \? nenne\(t\.inviteConfirmBody, \{ email: speaker\.email \}\) : t\.inviteConfirmBodyNoMail\}/);
    assert.match(text, /fuehreAus\(\(\) => inviteSpeaker\(speaker\.id\), t\.invited\)/);
    // der Kopf und der Block Onboarding fragen; sonst ruft nichts im Fenster `inviteSpeaker` auf
    assert.equal((text.match(/setEinladungFrage\(true\)/g) ?? []).length, 2);
    assert.equal((text.match(/inviteSpeaker\(/g) ?? []).length, 1);
  });

  it("Prio im Kopf nur für das Team, die Hotel-Kategorie nur bei Abweichung und nur der Teil vor der Klammer", () => {
    const text = f();
    assert.match(text, /const prio = isTeam && speaker\.priority \?/);
    assert.match(text, /const hotelAbweichend = speaker\.hotel_tier !== "standard";/);
    assert.match(text, /\.split\(" \("\)\[0\]/);
    assert.match(text, /\{hotelAbweichend && <Badge tone="accent">\{nenne\(t\.hotelBadge, \{ tier: hotelKurz \}\)\}<\/Badge>\}/);
  });

  it("Stand-Aktionen schließen das Fenster nicht; nur „Änderungen speichern“ tut es", () => {
    const text = f();
    assert.match(text, /function fuehreAus\(aktionFn: \(\) => Promise<KopfErgebnis>, okText: string, danach\?: \(\) => void\)/);
    const fuehreAus = text.slice(text.indexOf("function fuehreAus"), text.indexOf("function onSave"));
    assert.doesNotMatch(fuehreAus, /onClose\(\)/);
    const onSave = text.slice(text.indexOf("function onSave"), text.indexOf("const opt ="));
    assert.match(onSave, /onClose\(\);/);
  });

  it("„Änderungen speichern“ ist zweitrangig, die Fußleiste ist `ModalFuss` und das letzte Kind — ohne eigene Meldung", () => {
    const text = f();
    assert.match(text, /<ModalFuss>[\s\S]*<\/ModalFuss>\s*<\/Modal>/);
    const fuss = text.slice(text.indexOf("<ModalFuss>"), text.indexOf("</ModalFuss>"));
    assert.match(fuss, /<Button variant="secondary" onClick=\{onSave\} loading=\{pending\} disabled=\{adresse\}>\s+\{t\.saveChanges\}/);
    assert.doesNotMatch(fuss, /\{fehler\}|role="alert"/, "die Meldung zeigt ModalFuss selbst (#358)");
    assert.match(text, /<Modal label=\{name\} onCancel=\{schliessen\} size="wide" error=\{fehler\}>/);
    assert.doesNotMatch(text, /-mx-6|-mb-6|-bottom-6/);
    // Fehler stehen im Fenster, nie als Toast (ADM-062)
    assert.doesNotMatch(text, /toast\("error"/);
  });

  it("Schließen und Escape fragen bei Ungespeichertem zurück — „Änderungen verwerfen?“", () => {
    const text = f();
    assert.match(text, /const geaendert = entwurfGeaendert\(fensterEntwurf\(speaker\), draft, isTeam, einordnungVorher, einordnung\);/);
    assert.match(text, /const schliessen = \(\) => \(geaendert \? setVerwerfenFrage\(true\) : onClose\(\)\);/);
    assert.equal((text.match(/onClick=\{schliessen\}/g) ?? []).length, 2, "oben rechts und in der Fußleiste");
    assert.match(text, /title=\{t\.discardTitle\}[\s\S]*cancelLabel=\{t\.keepEditing\}/);
  });

  it("alle Texte, die das Fenster liest, stehen in DE und EN", () => {
    const text = f();
    const schluessel = [...new Set([...text.matchAll(/\bt\.([A-Za-z]\w*)/g)].map((m) => m[1]))].filter((x) => x !== "replace");
    assert.ok(schluessel.length > 40, "das Fenster liest viele Texte");
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).leads;
      assert.deepEqual(schluessel.filter((x) => w[x] === undefined), [], `${sprache}.leads: fehlende Texte`);
    }
    // jede Pflicht und jeder Schritt des Speakers hat seinen Text; die Hauptaktionen haben ihre Knopftexte
    for (const sprache of ["de", "en"] as const) {
      const w = woerterbuch(sprache).leads;
      for (const p of ["invite", "hospitality", "travel", "session"]) assert.ok(w[`duty_${p}`], `${sprache}.duty_${p}`);
      for (const x of ["actionContact", "confirmAction", "actionInvite", "actionHospitality", "actionTravel", "actionSession"]) assert.ok(w[x], `${sprache}.${x}`);
    }
  });

  it("Platzhalter der neuen Texte stehen in beiden Sprachen gleich", () => {
    const de = woerterbuch("de").leads;
    const en = woerterbuch("en").leads;
    const mit = ["markOpenN", "shortActivity", "shortConfirmedOn", "shortCategory", "shortInvited", "shortStepsOpen", "shortTasks", "shortSessions", "stageCounter", "declinedLine", "hotelBadge", "inviteConfirmBody"];
    const platz = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of mit) assert.equal(platz(de[k]), platz(en[k]), k);
    assert.equal(platz(de.stageCounter), "m,n");
  });
});
