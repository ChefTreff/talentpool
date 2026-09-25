import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { mitBetrifftZeile } from "@/lib/mail/betrifft";
import { markdownToHtml } from "@/lib/mail/render";
import { toRpcFailure } from "@/lib/rpc-error";
import { migrationText } from "@/tests/migration-datei";

/**
 * Mail-Weiche (PART-091): verwaltet der Partner alles, gehen die Speaker-Mails
 * an seinen Kontakt. Die Datenbank leitet um (`queue_speaker_mail`), der
 * Versand sagt oben, wen die Mail betrifft.
 */
const sql = () => migrationText("v6_speaker_mail_weiche");
const woerterbuch = (sprache: "de" | "en") =>
  JSON.parse(readFileSync(new URL(`../lib/i18n/${sprache}.json`, import.meta.url), "utf8"));
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Der Text einer Funktion in der Migration, von `create … function name(` bis `end $$;` bzw. `$$;`. */
function funktion(name: string): string {
  const s = sql();
  const start = s.search(new RegExp(`create (or replace )?function ${name}\\(`));
  assert.ok(start >= 0, `${name} fehlt in der Migration`);
  const ende = s.indexOf("$$;", s.indexOf("AS $$", start) + 5);
  return s.slice(start, ende);
}

describe("Mail-Weiche: die Zeile „betrifft“", () => {
  it("ohne Umleitung bleibt die Mail, wie sie ist", () => {
    assert.equal(mitBetrifftZeile("Hallo Anna,", {}, "de"), "Hallo Anna,");
    assert.equal(mitBetrifftZeile("Hallo Anna,", { on_behalf_of: "" }, "de"), "Hallo Anna,");
    assert.equal(mitBetrifftZeile("Hallo Anna,", { on_behalf_of: 42 }, "de"), "Hallo Anna,");
  });

  it("mit Umleitung steht der Name oben, in der Sprache der Mail", () => {
    const de = mitBetrifftZeile("Hallo Clara,", { on_behalf_of: "Anna A, Bert B" }, "de");
    assert.ok(de.startsWith("**Diese Mail betrifft Anna A, Bert B.**"));
    assert.ok(de.endsWith("\n\nHallo Clara,"));
    const en = mitBetrifftZeile("Hi Clara,", { on_behalf_of: "Anna A" }, "en");
    assert.ok(en.startsWith("**This email concerns Anna A.**"));
  });

  it("ein Name kann keinen Link und keinen Fettdruck einschleusen", () => {
    const md = mitBetrifftZeile("Text", { on_behalf_of: "[Hier klicken](https://example.com/x) **Admin**" }, "de");
    const html = markdownToHtml(md);
    assert.doesNotMatch(html, /<a /);
    assert.match(html, /Diese Mail betrifft Hier klickenhttps:\/\/example\.com\/x Admin\./);
  });

  it("der Versand stellt die Zeile voran", () => {
    assert.match(quelle("lib/mail/queue.ts"), /mitBetrifftZeile\(fillVars\(template\.body_md, vars\), vars, locale\)/);
  });
});

describe("Mail-Weiche: Datenbank", () => {
  it("die Empfänger-Regel: Kontakt des Profils mit Zugang und Adresse, sonst die Speakerin", () => {
    const f = funktion("speaker_mail_recipient");
    assert.match(f, /c\.id = sp\.mail_via_contact_id and c\.profile_id = sp\.id and c\.has_access/);
    assert.match(f, /deleted_at is null/);
    assert.match(f, /pe\.is_primary/);
    assert.match(f, /sp\.person_id\)/);
  });

  it("die Weiche und ihre Helfer sind intern", () => {
    for (const sig of [
      "speaker_mail_recipient(uuid)",
      "queue_speaker_mail(text, uuid, jsonb, text, uuid)",
      "speaker_mail_locale(uuid)",
    ]) {
      assert.ok(sql().includes(`revoke execute on function ${sig} from public, anon, authenticated;`), sig);
    }
  });

  it("alle Einzelmails gehen über die Weiche, in der Sprache des Empfängers", () => {
    const faelle: [string, string][] = [
      ["confirm_hospitality", "hospitality_confirmed"],
      ["confirm_companion_ticket", "companion_ticket_confirmed"],
      ["decline_companion_ticket", "companion_ticket_declined"],
      ["approve_expense", "expense_approved"],
      ["reject_expense", "expense_rejected"],
      ["ticket_final_mail", "ticket_final"],
    ];
    for (const [name, vorlage] of faelle) {
      const f = funktion(name);
      assert.ok(f.includes(`queue_speaker_mail('${vorlage}'`), `${name} nutzt die Weiche nicht`);
      assert.ok(!f.includes(`queue_mail('${vorlage}'`), `${name} schreibt noch direkt`);
    }
    for (const name of ["confirm_hospitality", "approve_expense", "reject_expense"]) {
      assert.match(funktion(name), /v_locale := speaker_mail_locale\(v_sp\.id\)/, name);
    }
  });

  it("die Session-Mails gehen je Empfänger einmal und nennen die Speaker", () => {
    for (const [name, vorlage] of [
      ["send_presentation_reminders", "presentation_reminder"],
      ["register_session_asset", "stage_photos_ready"],
    ] as const) {
      const f = funktion(name);
      assert.ok(f.includes(`queue_mail('${vorlage}', r.recipient,`), name);
      assert.match(f, /speaker_mail_recipient\(sp\.id\)/, name);
      assert.match(f, /jsonb_build_object\('on_behalf_of', r\.fuer\)/, name);
      assert.match(f, /string_agg\(distinct/, name);
    }
  });

  it("die Einladung bleibt persönlich und wird bei gesetzter Regel abgewiesen", () => {
    const f = funktion("invite_speaker");
    assert.match(f, /if v_sp\.mail_via_contact_id is not null then\s+raise exception 'speaker_managed_by_partner' using errcode = 'P0001'/);
    assert.ok(f.includes("queue_mail('speaker_invite', v_sp.person_id,"));
    assert.ok(!f.includes("queue_speaker_mail"));
  });

  it("die Migration endet mit harden_definer_functions", () => {
    assert.match(sql().trimEnd(), /select harden_definer_functions\(\);$/);
  });
});

describe("Mail-Weiche: Fehlerschlüssel und Admin-Detail", () => {
  it("speaker_managed_by_partner kommt als eigene Meldung an", () => {
    const res = toRpcFailure({
      code: "P0001",
      message: "speaker_managed_by_partner",
      details: "",
      hint: "",
      name: "PostgrestError",
    } as Parameters<typeof toRpcFailure>[0]);
    assert.equal(res.key, "speaker_managed_by_partner");
    for (const sprache of ["de", "en"] as const) {
      assert.ok(woerterbuch(sprache).rpc.speaker_managed_by_partner, `${sprache}.rpc fehlt`);
      const t = woerterbuch(sprache).adminSpeaker;
      assert.ok(t.mailVia?.includes("{name}") && t.mailViaNoAccess?.includes("{name}"), `${sprache}.adminSpeaker fehlt`);
    }
  });

  it("das Admin-Detail zeigt den Weg und bietet dann keine Einladung an", () => {
    const d = quelle("app/(admin)/admin/speaker/[id]/Detail.tsx");
    assert.match(d, /speaker\.mail_via &&/);
    assert.match(d, /!speaker\.stage_guest && !speaker\.mail_via &&/);
    assert.match(funktion("speaker_detail"), /'mail_via', \(select jsonb_build_object\(/);
  });
});
