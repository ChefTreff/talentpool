import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ENTSCHEIDUNG_MAIL_FRIST_MINUTEN, mitEntscheidungFrist, zeigtEntscheidungHinweis } from "@/lib/mail/entscheidung-frist";
import { migrationText } from "@/tests/migration-datei";

/**
 * PART-124 / PART-146: Zusage, Warteliste und Absage warten zehn Minuten, jede andere Entscheidung bis dahin stoppt die wartende Mail. Die
 * Datenbank-Seite belegen `supabase/tests/v6_zusage_mail_verzoegert.sql` (17 Erwartungen) und `v6_entscheidungsmails_verzoegert.sql` (16 Erwartungen),
 * beide mit echtem Rollenwechsel und Gegenstücken zu jeder Prüfung; hier steht, was sich ohne Datenbank festhalten lässt: die Frist in Migration und
 * Oberfläche ist dieselbe, jeder Stornierungsgrund hat eine Beschriftung, die Hinweise sagen, was passiert — und stehen nur dort, wo es stimmt.
 * Die aktuelle Fassung des Triggers steht in `v6_entscheidungsmails_verzoegert` (PART-146); sie löst die aus `v6_zusage_mail_verzoegert` ab.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
type Woerterbuch = {
  partnerApplicants: Record<string, string>;
  admin: { applications: Record<string, string> };
  adminMailLog: Record<string, string>;
};
const woerterbuch = (sprache: "de" | "en"): Woerterbuch => JSON.parse(quelle(`lib/i18n/${sprache}.json`)) as Woerterbuch;
const sql = () => migrationText("v6_entscheidungsmails_verzoegert");
const code = (text: string) => text.replace(/--[^\n]*/g, "");
const SPRACHEN = ["de", "en"] as const;

describe("PART-124/146: die Frist steht in Migration und Oberfläche gleich", () => {
  it("die Zahl ist eine ganze Minutenzahl innerhalb dessen, was `queue_mail_debounced` zulässt (höchstens 24 Stunden)", () => {
    assert.ok(Number.isInteger(ENTSCHEIDUNG_MAIL_FRIST_MINUTEN));
    assert.ok(ENTSCHEIDUNG_MAIL_FRIST_MINUTEN > 0 && ENTSCHEIDUNG_MAIL_FRIST_MINUTEN <= 24 * 60);
  });

  it("Zusage, Warteliste und Absage werden mit genau dieser Frist eingereiht", () => {
    const aufruf = code(sql()).match(/queue_mail_debounced\(\s*v_key,[^;]*?interval '(\d+) minutes'\s*\)/);
    assert.ok(aufruf, "Aufruf von queue_mail_debounced mit Frist fehlt im Trigger");
    assert.equal(Number(aufruf[1]), ENTSCHEIDUNG_MAIL_FRIST_MINUTEN);
  });

  it("nur diese drei haben die Frist: Eingangsbestätigung und Nachrücken gehen weiter über queue_mail", () => {
    const text = code(sql());
    assert.match(
      text,
      /if v_key in \('application_accepted', 'application_waitlisted', 'application_declined'\) then\s+perform queue_mail_debounced\(/,
    );
    assert.match(text, /else\s+perform queue_mail\(v_key, new\.person_id, v_vars, 'application', new\.id\);\s+end if;/);
    assert.equal((text.match(/queue_mail_debounced\(/g) ?? []).length, 1);
    assert.ok(!/'application_promoted'[^)]*\)\s+then\s+perform queue_mail_debounced/.test(text), "Nachrücken darf keine Frist haben");
  });

  it("`mitEntscheidungFrist` setzt jede Fundstelle ein und lässt keinen Platzhalter stehen", () => {
    assert.equal(
      mitEntscheidungFrist("nach {minuten} Minuten, nicht vor {minuten}"),
      `nach ${ENTSCHEIDUNG_MAIL_FRIST_MINUTEN} Minuten, nicht vor ${ENTSCHEIDUNG_MAIL_FRIST_MINUTEN}`,
    );
    assert.equal(mitEntscheidungFrist("ohne Platzhalter"), "ohne Platzhalter");
  });
});

describe("PART-124/146: Stornierungsgründe und ihre Beschriftung im Mail-Protokoll", () => {
  const gruende = [...new Set([...code(sql()).matchAll(/'(accept_[a-z_]+|decision_[a-z_]+)'/g)].map((m) => m[1]))].sort();

  it("die Migration kennt genau drei Gründe: Zusage zurückgenommen, Zusage bestätigt, Entscheidung geändert", () => {
    assert.deepEqual(gruende, ["accept_confirmed", "accept_revoked", "decision_changed"]);
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

    it(`${sprache}: es gibt keine Beschriftung für einen Entscheidungsgrund, den die Migration nicht kennt`, () => {
      const log = woerterbuch(sprache).adminMailLog;
      const beschriftet = Object.keys(log)
        .filter((k) => /^cancelReason_(accept|decision)_/.test(k))
        .map((k) => k.replace("cancelReason_", ""));
      assert.deepEqual(beschriftet.sort(), gruende);
    });
  }

  it("die Stornierung: jede der drei Entscheidungen storniert ihre eigene Vorlage — Zusage mit eigenem Grund, die anderen mit `decision_changed`", () => {
    const text = code(sql());
    assert.match(text, /if old\.status in \('accepted', 'waitlisted', 'declined'\) then\s+perform cancel_queued_mail\(/);
    assert.match(
      text,
      /case old\.status when 'accepted' then 'application_accepted' when 'waitlisted' then 'application_waitlisted' else 'application_declined' end,/,
    );
    assert.match(
      text,
      /case when old\.status = 'accepted' then \(case new\.status when 'confirmed' then 'accept_confirmed' else 'accept_revoked' end\)\s+else 'decision_changed' end\);/,
    );
  });
});

describe("PART-124/146: die Hinweise sagen, was passiert", () => {
  for (const sprache of SPRACHEN) {
    const w = woerterbuch(sprache);
    const pa = w.partnerApplicants;
    const ad = w.admin.applications;

    it(`${sprache}: der Hinweis im Partner-Portal nennt alle drei Mails, die Frist und dass eine Änderung die Mail stoppt`, () => {
      assert.match(pa.decisionMailNote, /\{minuten\}/);
      assert.equal(pa.acceptMailNote, undefined, "der alte Schlüssel (nur Zusage) ist weg");
      const text = mitEntscheidungFrist(pa.decisionMailNote);
      assert.ok(!/[{}]/.test(text), "Platzhalter übrig");
      assert.match(text, new RegExp(String(ENTSCHEIDUNG_MAIL_FRIST_MINUTEN)));
      if (sprache === "de") {
        assert.match(text, /Zusage, Warteliste und Absage/);
        assert.match(text, /erst nach etwa/);
        assert.match(text, /nicht verschickt/);
        assert.match(text, /nur die Mail zur neuen Entscheidung/);
      } else {
        assert.match(text, /acceptance, waitlist or decline/);
        assert.match(text, /only after about/);
        assert.match(text, /not sent/);
        assert.match(text, /only gets the email for the new decision/);
      }
    });

    it(`${sprache}: die drei Hinweise im Admin nennen dieselbe Frist und sagen nicht mehr „sofort“`, () => {
      for (const key of ["releasedMailHint", "bulkReleasedWarning", "bulkReleasedWarningOne"]) {
        assert.match(ad[key], /\{minuten\}/, `${sprache}.admin.applications.${key}`);
        const text = mitEntscheidungFrist(ad[key].replace("{n}", "3"));
        assert.ok(!/[{}]/.test(text), `${key}: Platzhalter übrig`);
        assert.match(text, new RegExp(String(ENTSCHEIDUNG_MAIL_FRIST_MINUTEN)));
        assert.ok(!/sofort|right away/i.test(text), `${key}: Warteliste und Absage gehen nicht mehr sofort raus`);
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
          assert.equal(zeigtEntscheidungHinweis({ freigegeben, canEdit, nurTeilnehmende }), erwartet, JSON.stringify({ freigegeben, canEdit, nurTeilnehmende }));
        }
      }
    }
  });
});

describe("PART-124/146: die Seiten benutzen es (Quelltext-Prüfung — kein Render, JSX lädt der Testlader nicht)", () => {
  it("Partner-Portal: der Hinweis hängt an `zeigtEntscheidungHinweis` und trägt die eingesetzte Frist", () => {
    const seite = quelle("app/(partner)/partner/FormatBewerbungen.tsx");
    assert.match(seite, /zeigtEntscheidungHinweis\(\{\s*freigegeben: freigegeben\.get\(x\.id\) === true,\s*canEdit,\s*nurTeilnehmende\s*\}\)\s*&&\s*\(/);
    assert.match(seite, /role="note"/);
    assert.match(seite, /mitEntscheidungFrist\(t\.applicants\.decisionMailNote\)/);
  });

  it("Admin: Warteschlange einer Session und Sammelentscheidung sagen dasselbe", () => {
    const queue = quelle("app/(admin)/admin/bewerbungen/[id]/QueueView.tsx");
    assert.match(queue, /session\.released && \(\s*<p className="ct-help mt-3">\{mitEntscheidungFrist\(t\.releasedMailHint\)\}<\/p>/);
    assert.match(queue, /!session\.released && \(\s*<p className="ct-help mt-3">\{t\.notReleasedHint\}<\/p>/);
    const liste = quelle("app/(admin)/admin/bewerbungen/BewerbungsListe.tsx");
    assert.match(liste, /mitEntscheidungFrist\(\s*freigegebenUnter === 1\s*\? t\.bulkReleasedWarningOne\s*: t\.bulkReleasedWarning\.replace\("\{n\}", String\(freigegebenUnter\)\),?\s*\)/);
  });
});

describe("PART-124/146: die Vorlagen der drei Entscheidungen gibt es auf Deutsch und Englisch", () => {
  it("die Migration, die sie anlegt, trägt beide Sprachen (live geprüft: aktiv, Version 1)", () => {
    const seed = quelle("supabase/migrations/20260910074957_v2_application_mails_queue.sql");
    for (const key of ["application_accepted", "application_waitlisted", "application_declined"]) {
      assert.match(seed, new RegExp(`\\('${key}', 'de', 1,`));
      assert.match(seed, new RegExp(`\\('${key}', 'en', 1,`));
    }
  });
});
