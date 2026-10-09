import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ZUSAGE_MAIL_FRIST_MINUTEN, mitZusageFrist, zeigtZusageHinweis } from "@/lib/mail/zusage-frist";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-124: Die Zusage-Mail wartet zehn Minuten, eine andere Entscheidung bis dahin stoppt sie. Die Datenbank-Seite belegt
 * `supabase/tests/v6_zusage_mail_verzoegert.sql` (17 Erwartungen, echter Rollenwechsel, Gegenstücke zu jeder Prüfung); hier steht, was sich
 * ohne Datenbank festhalten lässt: die Frist in Migration und Oberfläche ist dieselbe, jeder Stornierungsgrund der Migration hat eine
 * Beschriftung im Mail-Protokoll, die Hinweise sagen, was passiert — und stehen nur dort, wo es stimmt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Woerterbuch = {
  partnerApplicants: Record<string, string>;
  admin: { applications: Record<string, string> };
  adminMailLog: Record<string, string>;
};
const woerterbuch = (sprache: "de" | "en"): Woerterbuch => JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as Woerterbuch;
const sql = () => migrationText("v6_zusage_mail_verzoegert");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const SPRACHEN = ["de", "en"] as const;

describe("PART-124: die Frist steht in Migration und Oberfläche gleich", () => {
  it("die Zahl ist eine ganze Minutenzahl innerhalb dessen, was `queue_mail_debounced` zulässt (höchstens 24 Stunden)", () => {
    assert.ok(Number.isInteger(ZUSAGE_MAIL_FRIST_MINUTEN));
    assert.ok(ZUSAGE_MAIL_FRIST_MINUTEN > 0 && ZUSAGE_MAIL_FRIST_MINUTEN <= 24 * 60);
  });

  it("die Zusage-Mail wird mit genau dieser Frist eingereiht", () => {
    const aufruf = code(sql()).match(/queue_mail_debounced\(\s*v_key,[^;]*?interval '(\d+) minutes'\s*\)/);
    assert.ok(aufruf, "Aufruf von queue_mail_debounced mit Frist fehlt im Trigger");
    assert.equal(Number(aufruf[1]), ZUSAGE_MAIL_FRIST_MINUTEN);
  });

  it("nur die Zusage hat die Frist: alle übrigen Mails gehen weiter über queue_mail", () => {
    const text = code(sql());
    assert.match(text, /if v_key = 'application_accepted' then\s+perform queue_mail_debounced\(/);
    assert.match(text, /else\s+perform queue_mail\(v_key, new\.person_id, v_vars, 'application', new\.id\);\s+end if;/);
    assert.equal((text.match(/queue_mail_debounced\(/g) ?? []).length, 1);
  });

  it("`mitZusageFrist` setzt jede Fundstelle ein und lässt keinen Platzhalter stehen", () => {
    assert.equal(mitZusageFrist("nach {minuten} Minuten, nicht vor {minuten}"), `nach ${ZUSAGE_MAIL_FRIST_MINUTEN} Minuten, nicht vor ${ZUSAGE_MAIL_FRIST_MINUTEN}`);
    assert.equal(mitZusageFrist("ohne Platzhalter"), "ohne Platzhalter");
  });
});

describe("PART-124: Stornierungsgründe und ihre Beschriftung im Mail-Protokoll", () => {
  const gruende = [...new Set([...code(sql()).matchAll(/'(accept_[a-z_]+)'/g)].map((m) => m[1]))].sort();

  it("die Migration kennt genau zwei Gründe: zurückgenommen und bestätigt", () => {
    assert.deepEqual(gruende, ["accept_confirmed", "accept_revoked"]);
  });

  for (const sprache of SPRACHEN) {
    it(`${sprache}: jeder Grund hat eine eigene Beschriftung (adminMailLog.cancelReason_…)`, () => {
      const log = woerterbuch(sprache).adminMailLog;
      const texte = gruende.map((g) => {
        const text = log[`cancelReason_${g}`];
        assert.equal(typeof text, "string", `${sprache}.adminMailLog.cancelReason_${g}`);
        assert.ok(text.trim().length > 0);
        return text;
      });
      assert.equal(new Set(texte).size, texte.length, "zwei Gründe mit demselben Text");
    });

    it(`${sprache}: es gibt keine Beschriftung für einen Grund, den die Migration nicht kennt`, () => {
      const log = woerterbuch(sprache).adminMailLog;
      const beschriftet = Object.keys(log).filter((k) => k.startsWith("cancelReason_accept_")).map((k) => k.replace("cancelReason_", ""));
      assert.deepEqual(beschriftet.sort(), gruende);
    });
  }

  it("die Stornierung: nur Bestätigung heißt `accept_confirmed`, jeder andere Weg aus `accepted` heißt `accept_revoked`", () => {
    const text = code(sql());
    assert.match(
      text,
      /if old\.status = 'accepted' then\s+perform cancel_queued_mail\('application_accepted', new\.id, new\.person_id,\s+case new\.status when 'confirmed' then 'accept_confirmed' else 'accept_revoked' end\);/,
    );
  });
});

describe("PART-124: die Hinweise sagen, was passiert", () => {
  for (const sprache of SPRACHEN) {
    const w = woerterbuch(sprache);
    const pa = w.partnerApplicants;
    const ad = w.admin.applications;

    it(`${sprache}: der Hinweis im Partner-Portal nennt die Frist und dass eine Änderung die Mail stoppt`, () => {
      assert.match(pa.acceptMailNote, /\{minuten\}/);
      const text = mitZusageFrist(pa.acceptMailNote);
      assert.ok(!/[{}]/.test(text), "Platzhalter übrig");
      assert.match(text, new RegExp(String(ZUSAGE_MAIL_FRIST_MINUTEN)));
      if (sprache === "de") {
        assert.match(text, /Zusage-Mail/);
        assert.match(text, /erst nach etwa/);
        assert.match(text, /nicht verschickt/);
        assert.match(text, /Warteliste und Absage gehen ohne diese Wartezeit raus/);
      } else {
        assert.match(text, /acceptance email/);
        assert.match(text, /only after about/);
        assert.match(text, /not sent/);
        assert.match(text, /Waitlist and decline emails go out without this wait/);
      }
    });

    it(`${sprache}: die drei Hinweise im Admin nennen dieselbe Frist`, () => {
      for (const key of ["releasedMailHint", "bulkReleasedWarning", "bulkReleasedWarningOne"]) {
        assert.match(ad[key], /\{minuten\}/, `${sprache}.admin.applications.${key}`);
        const text = mitZusageFrist(ad[key].replace("{n}", "3"));
        assert.ok(!/[{}]/.test(text), `${key}: Platzhalter übrig`);
        assert.match(text, new RegExp(String(ZUSAGE_MAIL_FRIST_MINUTEN)));
      }
    });

    it(`${sprache}: vor der Freigabe bleibt der Satz, dass aus der Oberfläche keine Mail rausgeht`, () => {
      assert.match(pa.notReleasedLong, sprache === "de" ? /keine Mail raus/ : /no email|no mail/i);
      assert.ok(!/\{minuten\}/.test(pa.notReleasedLong), "vor der Freigabe gibt es keine Frist");
    });
  }

  it("der Hinweis steht nur dort, wo entschieden wird und die Entscheidungen schon verschickt werden (alle acht Fälle)", () => {
    for (const freigegeben of [true, false]) {
      for (const canEdit of [true, false]) {
        for (const nurTeilnehmende of [true, false]) {
          const erwartet = freigegeben && canEdit && !nurTeilnehmende;
          assert.equal(zeigtZusageHinweis({ freigegeben, canEdit, nurTeilnehmende }), erwartet, JSON.stringify({ freigegeben, canEdit, nurTeilnehmende }));
        }
      }
    }
  });
});

describe("PART-124: die Seiten benutzen es (Quelltext-Prüfung — kein Render, JSX lädt der Testlader nicht)", () => {
  it("Partner-Portal: der Hinweis hängt an `zeigtZusageHinweis` und trägt die eingesetzte Frist", () => {
    const seite = quelle("app/(partner)/partner/FormatBewerbungen.tsx");
    assert.match(seite, /zeigtZusageHinweis\(\{\s*freigegeben: freigegeben\.get\(x\.id\) === true,\s*canEdit,\s*nurTeilnehmende\s*\}\)\s*&&\s*\(/);
    assert.match(seite, /role="note"/);
    assert.match(seite, /mitZusageFrist\(t\.applicants\.acceptMailNote\)/);
  });

  it("Admin: Warteschlange einer Session und Sammelentscheidung sagen dasselbe", () => {
    const queue = quelle("app/(admin)/admin/bewerbungen/[id]/QueueView.tsx");
    assert.match(queue, /session\.released && \(\s*<p className="ct-help mt-3">\{mitZusageFrist\(t\.releasedMailHint\)\}<\/p>/);
    assert.match(queue, /!session\.released && \(\s*<p className="ct-help mt-3">\{t\.notReleasedHint\}<\/p>/);
    const liste = quelle("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    assert.match(liste, /mitZusageFrist\(\s*freigegebenUnter === 1\s*\? t\.bulkReleasedWarningOne\s*: t\.bulkReleasedWarning\.replace\("\{n\}", String\(freigegebenUnter\)\),?\s*\)/);
  });
});

describe("PART-124: die Vorlage `application_accepted` gibt es auf Deutsch und Englisch", () => {
  it("die Migration, die sie anlegt, trägt beide Sprachen (live geprüft: beide aktiv, Version 1)", () => {
    const seed = quelle("supabase/migrations/20260910074957_v2_application_mails_queue.sql");
    assert.match(seed, /\('application_accepted', 'de', 1,/);
    assert.match(seed, /\('application_accepted', 'en', 1,/);
  });
});
