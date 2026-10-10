import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { profilEmail } from "@/components/partner/bewerbung";
import { istVorschlag, migrationText } from "@/tests/migration-datei";

/**
 * PART-147 (Talent-Chat 08.10., #403): die E-Mail-Adresse einer Bewerbung steht im Schubfach des Partners — nur mit Weitergabe und nur die primäre. Die Datenbank belegt
 * `supabase/tests/v6_bewerbung_email.sql` (16 Erwartungen mit Auswertung, Gegenstücke je Fall: Einwilligung, Widerruf, Team, fremde Organisation, Audit ohne Adresse).
 * Hier steht, was sich ohne Datenbank festhalten lässt: die Prüfung der Adresse vor dem `mailto:`-Link, die Form der Migration (Quelltext) und die Verdrahtung im Schubfach.
 */
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const migration = () => migrationText("v6_bewerbung_email");
/** Kommentare raus: ein Satz, der etwas erwähnt, ist keine Anweisung. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

function funktion(sql: string, name: string): string {
  const m = new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)(?=\\ncreate or replace function |\\nselect harden_definer_functions|$)`).exec(sql);
  assert.ok(m, `Funktion ${name} nicht gefunden`);
  return m[0].trimEnd();
}

describe("PART-147: Prüfung der Adresse vor dem Link", () => {
  it("eine gewöhnliche Adresse geht durch, getrimmt, auch mit Umlaut, Plus und Unterdomänen", () => {
    for (const ok of [
      "ada@example.org",
      "  ada.lovelace@uni-hamburg.de  ",
      "konrad+zztest-eurebuehne-1@chef-treff.de",
      "o'brien@firma.co.uk",
      "jörg.müller@uni-köln.de",
      "a_b-c@sub.domain.example.com",
    ]) {
      assert.equal(profilEmail({ email: ok }), ok.trim(), ok);
    }
  });

  it("alles, was in einem mailto: Empfänger anhängen oder etwas anderes als eine Adresse ausführen könnte, wird nicht verlinkt", () => {
    for (const schlecht of [
      "ada@example.org?cc=chef@example.com", // hängt einen Empfänger an
      "ada?cc=chef@example.org", // dasselbe vor dem @: `mailto:ada?cc=chef@example.org` wäre ein Empfänger „ada“ mit Kopie an chef@example.org
      "ada&bcc=chef@example.org",
      "ada?x@example.org", // schon das Fragezeichen allein öffnet die Parameter
      "ada&x@example.org",
      "ada@example.org&bcc=chef@example.com",
      "ada@example.org?subject=Hallo",
      "ada@example.org#frag",
      "ada%40example.org",
      "ada@example.org, chef@example.com", // zwei Empfänger
      "ada@example.org;chef@example.com",
      "ada example@example.org",
      "<script>@example.org",
      "javascript:alert(1)@example.org",
      "ada@example",
      "ada@.org",
      "@example.org",
      "ada@example.o",
      "ada/../x@example.org",
      "",
      "   ",
    ]) {
      assert.equal(profilEmail({ email: schlecht }), null, JSON.stringify(schlecht));
    }
    assert.equal(profilEmail({ email: `${"a".repeat(250)}@example.org` }), null, "länger als 254 Zeichen");
  });

  it("kein Text, keine Zeile, kein Profil: nichts", () => {
    for (const roh of [null, undefined, {}, { email: null }, { email: 42 }, { email: ["ada@example.org"] }, { email: { a: "ada@example.org" } }]) {
      assert.equal(profilEmail(roh as Record<string, unknown> | null | undefined), null);
    }
  });
});

describe("PART-147: das Schubfach", () => {
  const profil = src("components/partner/BewerbungProfil.tsx");

  it("zeigt die Adresse als Zeile des Profils mit mailto-Link, nur die geprüfte", () => {
    assert.match(profil, /const email = profilEmail\(a\.profile\);/);
    assert.match(profil, /href=\{`mailto:\$\{email\}`\}/);
    assert.match(profil, /\{t\.profile_email\}/);
    // Nur die Adresse allein ist auch ein Profil: der Leerzustand darf dann nicht erscheinen.
    assert.match(profil, /felder\.length === 0 && !link && !email \?/);
    // Nie die rohe Zeichenkette im Link — nur der geprüfte Wert.
    assert.doesNotMatch(profil, /mailto:\$\{a\.profile/);
  });

  it("die Admin-Liste (BewerbungDetails) zeigt sie nicht — der Weg steht nur im Schubfach der Partner", () => {
    assert.doesNotMatch(src("components/partner/BewerbungDetails.tsx"), /profilEmail|mailto:/);
  });

  it("die Beschriftung steht in beiden Wörterbüchern", () => {
    for (const sprache of ["de", "en"]) {
      const w = JSON.parse(src(`lib/i18n/${sprache}.json`)) as Record<string, Record<string, string>>;
      assert.equal(typeof w.partnerApplicants.profile_email, "string", sprache);
    }
    assert.equal((JSON.parse(src("lib/i18n/de.json")) as Record<string, Record<string, string>>).partnerApplicants.profile_email, "E-Mail");
  });
});

describe("PART-147: Migration v6_bewerbung_email (Quelltext-Prüfung)", () => {
  it("ändert genau zwei Funktionen, beide SECURITY DEFINER mit gepinntem search_path, und härtet am Ende", () => {
    const sql = code(migration());
    const namen = [...sql.matchAll(/create or replace function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(namen, ["applications_for_session", "partner_tour_applications"]);
    for (const n of namen) {
      const f = funktion(sql, n);
      assert.match(f, /SECURITY DEFINER/, `${n}: security definer`);
      assert.match(f, /SET search_path TO 'public', 'extensions'/, `${n}: search_path`);
    }
    assert.ok(sql.trim().endsWith("select harden_definer_functions();"));
    assert.ok(!migration().includes("$$;;"), "kein doppeltes Semikolon hinter einem Funktionsende");
    // Keine Tabelle, keine Spalte, kein Recht, keine Rückgabeform — nur diese zwei Funktionen.
    assert.doesNotMatch(sql, /\b(create|alter|drop)\s+(table|policy|trigger|type)\b|\bgrant\b|\brevoke\b|add column/i);
  });

  it("die Adresse ist die primäre der Person und steht an genau einer Stelle je Funktion", () => {
    const sql = code(migration());
    for (const n of ["applications_for_session", "partner_tour_applications"]) {
      const f = funktion(sql, n);
      assert.equal((f.match(/'email'/g) ?? []).length, 1, `${n}: ein Schlüssel email`);
      assert.match(f, /\(select pe\.email::text from person_email pe where pe\.person_id = p\.id and pe\.is_primary\)/, `${n}: primäre Adresse der Bewerberin`);
      assert.equal((f.match(/person_email/g) ?? []).length, 1, `${n}: person_email nur einmal`);
    }
  });

  it("Sitzung: die Adresse hängt an der Einwilligung, nicht am Team; Tour: sie liegt im Zweig der Einwilligung", () => {
    const sql = code(migration());
    const s = funktion(sql, "applications_for_session");
    // Das Team sieht Profilfelder auch ohne Einwilligung (`v_team or a.consent_share`) — die Adresse gehört nicht dazu.
    assert.match(s, /'email', case when a\.consent_share then \(select pe\.email::text/);
    assert.doesNotMatch(s, /case when v_team or a\.consent_share then \(select pe\.email/);
    const t = funktion(sql, "partner_tour_applications");
    const profilStart = t.indexOf("case when a.consent_share then jsonb_strip_nulls(jsonb_build_object(");
    const email = t.indexOf("'email', (select pe.email::text");
    const ende = t.indexOf("end,", email);
    assert.ok(profilStart >= 0 && email > profilStart && ende > email, "die Adresse steht im Zweig mit Einwilligung");
    // Der Tour-Abruf lässt das Audit wie es ist: keine Adresse im Eintrag.
    assert.doesNotMatch(t, /log_audit[^;]*email/);
  });

  it("gegen den Snapshot: je Funktion eine Zeile ersetzt und die Adresse samt Kommentar dazu — sonst nichts (solange Vorschlag)", (ctx) => {
    if (!istVorschlag("v6_bewerbung_email")) return ctx.skip("angewendet: der Snapshot ist maßgeblich und kann weitergewandert sein");
    const sql = migration();
    for (const n of ["applications_for_session", "partner_tour_applications"]) {
      const neu = funktion(sql, n).replace(/;$/, "").split("\n");
      const alt = readFileSync(new URL(`../supabase/snapshot/functions/${n}.sql`, import.meta.url), "utf8").trimEnd().replace(/;$/, "").split("\n");
      const nurAlt = alt.filter((z) => !neu.includes(z));
      const nurNeu = neu.filter((z) => !alt.includes(z));
      assert.equal(nurAlt.length, 1, `${n}: genau eine Zeile weg (${JSON.stringify(nurAlt)})`);
      assert.match(nurAlt[0], /'linkedin_url', p\.linkedin_url\)\) end/, `${n}: die Zeile mit linkedin_url`);
      assert.equal(nurNeu.length, 3, `${n}: drei Zeilen dazu (${JSON.stringify(nurNeu)})`);
      assert.ok(nurNeu.some((z) => /^\s*-- PART-147:/.test(z)));
      assert.ok(nurNeu.some((z) => /'email'/.test(z)));
      assert.ok(nurNeu.some((z) => /'linkedin_url', p\.linkedin_url,$/.test(z)));
    }
  });
});

describe("PART-147: Doku und Konrads Konto", () => {
  it("der Klickweg steht in den Testdaten (kein neuer Schritt: die Bewerbungen der vorhandenen Schritte tragen Konrads Plus-Adressen)", () => {
    const doc = src("docs/testdaten-konrad.md");
    assert.match(doc, /\*\*Bewerbung: E-Mail-Adresse im Schubfach \(PART-147\)/);
    assert.match(doc, /`\+zztest-tour-2`/);
    // Die Adressen der Testbewerbenden sind Konrads Postfach, keine fremden.
    const skript = src("scripts/testdaten-konrad.mjs");
    assert.match(skript, /const tourBewerbungAdresse = \(n = 1\) => email\.replace\("@", `\+zztest-tour-\$\{n\}@`\);/);
  });
});
