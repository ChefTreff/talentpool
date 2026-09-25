import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrationText } from "@/tests/migration-datei";
import {
  EIGENE_FRAGE_TYPEN,
  MAX_EIGENE_FRAGEN,
  antwortenMitText,
  optionenAusText,
  type SessionFrage,
} from "@/components/partner/fragen";

const sql = () => migrationText("v6_masterclass_fragen");
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const frage = (x: Partial<SessionFrage>): SessionFrage => ({
  key: "k", id: "i", question_id: null, label_de: "Frage", label_en: "Question", type: "text",
  required: false, sort_order: 1, approved_at: null, purpose: null, catalog_key: null, ...x,
});

describe("Masterclass: Fragen des Teams bleiben (PART-045, Datenmodell)", () => {
  it("gelöscht werden nur wählbare Katalogfragen, Behaltenes bleibt, wie es ist", () => {
    const s = sql();
    const f = s.slice(s.indexOf("create or replace function partner_set_session_questions("), s.indexOf("$$;"));
    assert.match(f, /delete from session_question sq\s+using question_catalog qc\s+where sq\.session_id = p_session_id and sq\.question_id = qc\.id and qc\.partner_selectable/);
    assert.doesNotMatch(f, /delete from session_question where session_id = p_session_id and question_id is not null;/);
    assert.match(f, /if not exists \(select 1 from session_question sq where sq\.session_id = p_session_id and sq\.question_id = q\) then/);
    // Die Prüfung und das Recht aus 0133 bleiben.
    assert.match(f, /not \(qc\.partner_selectable and qc\.active\)/);
    assert.match(f, /if v_se\.partner_org_id is null or not partner_can_edit\(v_se\.partner_org_id\) then/);
    assert.match(f, /log_audit\('partner\.session_questions'/);
    assert.match(s.trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Masterclass: Fragen und Antworten in der Oberfläche (PART-045)", () => {
  it("Antworten stehen unter ihrem Fragetext, in der Reihenfolge der Fragen", () => {
    const fragen = [
      frage({ key: "q2", label_de: "Zweite", sort_order: 2 }),
      frage({ key: "cat1", question_id: "cat1", label_de: "Motivation", catalog_key: "motivation", sort_order: 1 }),
    ].sort((a, b) => a.sort_order - b.sort_order);
    const ergebnis = antwortenMitText({ fremd: "x", q2: "b", motivation: "a" }, fragen, "de");
    assert.deepEqual(Object.entries(ergebnis ?? {}), [["Motivation", "a"], ["Zweite", "b"], ["fremd", "x"]]);
    assert.equal(antwortenMitText(null, fragen, "de"), null);
  });

  it("eigene Fragen: Typen, die das Formular kann, Optionen wie im Katalog", () => {
    assert.equal(MAX_EIGENE_FRAGEN, 2);
    assert.ok(!(EIGENE_FRAGE_TYPEN as readonly string[]).includes("multiselect"));
    const rpc = src("supabase/snapshot/functions/partner_request_question.sql");
    for (const typ of EIGENE_FRAGE_TYPEN) assert.ok(rpc.includes(`'${typ}'`), `RPC kennt ${typ}`);
    assert.deepEqual(optionenAusText(" Ja \n\nNein\nJa\n"), [
      { key: "Ja", label_de: "Ja", label_en: "Ja" },
      { key: "Nein", label_de: "Nein", label_en: "Nein" },
    ]);
  });

  it("Seite im Menü, vier Reiter, Schreibwege über die Partner-RPCs", () => {
    assert.match(src("app/(partner)/layout.tsx"), /masterclass: \{ href: "\/partner\/masterclass"/);
    const reiter = src("app/(partner)/partner/FormatReiter.tsx");
    for (const pfad of ["`${basis}/bewerbungen`", "`${basis}/teilnehmende`", "`${basis}/fragen`"]) assert.ok(reiter.includes(pfad), pfad);
    assert.match(src("app/(partner)/partner/masterclass/MasterclassKopf.tsx"), /basis="\/partner\/masterclass"/);
    assert.match(src("app/(partner)/partner/masterclass/daten.ts"), /p_format: "masterclass"/);
    assert.match(src("app/(partner)/partner/masterclass/MasterclassInhalt.tsx"), /updateFormatSession\(\{ sessionId: session\.id, fields \}\)/);
    assert.match(src("app/(partner)/partner/masterclass/page.tsx"), /<SpeakerHinzufuegen/);
    const actions = src("app/(partner)/partner/actions.ts");
    assert.match(actions, /rpc\("partner_set_session_questions"/);
    assert.match(actions, /rpc\("partner_request_question"/);
  });

  it("entschieden wird nur im Reiter Bewerbungen, und nur mit Recht", () => {
    const liste = src("app/(partner)/partner/FormatBewerbungen.tsx");
    assert.match(liste, /rpc\("partner_applications", \{ p_session_id: x\.id \}\)/);
    assert.match(liste, /decide=\{!nurTeilnehmende && canEdit \? decideApplication : undefined\}/);
  });

  it("Admin-Weg: beantragte Fragen gibt das Team unter der Organisation frei", () => {
    const seite = src("app/(admin)/admin/partner/[org]/page.tsx");
    assert.match(seite, /\.is\("question_id", null\)\s*\.is\("approved_at", null\)/);
    assert.match(src("app/(admin)/admin/partner/actions.ts"), /export async function adminApproveSessionQuestions[\s\S]*rpc\("approve_session_questions", \{ p_session_id: sessionId \}\)/);
    assert.match(src("app/(admin)/admin/partner/[org]/OrgDetail.tsx"), /<FragenFreigabe/);
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of ["questionsTitle", "questionsLead", "questionPurpose", "questionsApprove", "questionsApproved"]) {
        assert.equal(typeof dict.adminPartner[key], "string", `${sprache}: adminPartner.${key}`);
      }
    }
  });

  it("alle benutzten Texte stehen in beiden Wörterbüchern", () => {
    const benutzt = (text: string, praefix: string) =>
      [...new Set([...text.matchAll(new RegExp(`\\b${praefix}\\.([a-zA-Z_]+)`, "g"))].map((m) => m[1]))];
    // Texte der Masterclass selbst …
    const masterclass = [
      ...["page.tsx"].flatMap((d) => benutzt(src(`app/(partner)/partner/masterclass/${d}`), "s")),
      ...["MasterclassKopf.tsx", "MasterclassInhalt.tsx"].flatMap((d) => benutzt(src(`app/(partner)/partner/masterclass/${d}`), "t")),
    ];
    // … und die gemeinsamen der Bewerbungsreiter (PART-082).
    const bewerbung = [
      ...benutzt(src("app/(partner)/partner/FormatBewerbungen.tsx"), "s"),
      ...benutzt(src("app/(partner)/partner/FormatFragen.tsx"), "s"),
      ...benutzt(src("app/(partner)/partner/FormatUnterseite.tsx"), "b"),
      ...benutzt(src("app/(partner)/partner/masterclass/MasterclassKopf.tsx"), "b"),
      ...["FragenAuswahl.tsx", "EigeneFrageAntrag.tsx"].flatMap((d) => benutzt(src(`components/partner/${d}`), "t")),
      ...EIGENE_FRAGE_TYPEN.map((typ) => `type_${typ}`),
    ].filter((k) => k !== "cancel");
    for (const sprache of ["de", "en"]) {
      const dict = JSON.parse(src(`lib/i18n/${sprache}.json`));
      for (const key of masterclass) assert.equal(typeof dict.partnerMasterclass[key], "string", `${sprache}: partnerMasterclass.${key}`);
      for (const key of bewerbung) assert.equal(typeof dict.partnerBewerbung[key], "string", `${sprache}: partnerBewerbung.${key}`);
      assert.equal(typeof dict.partner.navMasterclass, "string", `${sprache}: partner.navMasterclass`);
      for (const block of ["partnerSideEvent", "partnerInterviewTables"]) {
        assert.equal(typeof dict[block].tabMain, "string", `${sprache}: ${block}.tabMain`);
      }
    }
  });
});
