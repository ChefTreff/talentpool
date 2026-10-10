import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * ADM-067, Minimalweg (Plan 09.10.2026, Feedbackrunde Konrad und Paulina 05.10.): die Aufgaben der Speaker-Checkliste (`/admin/speaker/aufgaben`, SPK-024) sind von
 * der Speaker-Liste und vom Speaker-Detail aus erreichbar — ein Knopf „Aufgaben der Checkliste“ neben „Verlauf“ und „Website“, ein Link im Detail. **Kein neuer
 * Menüpunkt** (Konrads Go zur Admin-Struktur, K-95, steht aus) und **keine Checklisten-Vorlagen** (K-96, nicht raten). Keine Datenbankänderung: die Seite und ihre
 * Funktionen gibt es seit 0149. Der Test hält fest, wohin die Knöpfe führen, wer sie sieht und dass die Navigation unverändert bleibt.
 */
const quelle = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const LISTE = "app/(admin)/admin/speaker/page.tsx";
const DETAIL = "app/(admin)/admin/speaker/[id]/Detail.tsx";
const DETAIL_SEITE = "app/(admin)/admin/speaker/[id]/page.tsx";
const AUFGABEN = "app/(admin)/admin/speaker/aufgaben/page.tsx";

describe("ADM-067: der Weg zu den Aufgaben der Checkliste", () => {
  it("die Speaker-Liste hat den Knopf neben „Verlauf“ und „Website“ — ein ruhiger Knopf (ghost), nach den beiden anderen", () => {
    const q = quelle(LISTE);
    const verlauf = q.indexOf('href="/admin/speaker/verlauf"');
    const website = q.indexOf('href="/admin/speaker/website"');
    const aufgaben = q.indexOf('href="/admin/speaker/aufgaben"');
    assert.ok(verlauf > 0 && website > verlauf && aufgaben > website, "Reihenfolge Verlauf, Website, Aufgaben");
    assert.match(q, /<ButtonLink href="\/admin\/speaker\/aufgaben" variant="ghost" size="sm">\s+\{ta\.tasksLink\}\s+<\/ButtonLink>/);
    // alle stehen in derselben Aktionsgruppe des Seitenkopfs: die drei Wege (Verlauf, Website, Aufgaben) und seit ADM-078 „Berichte und Export“
    const gruppe = q.slice(q.indexOf("actions={"), q.indexOf("      />", q.indexOf("actions={")));
    assert.equal((gruppe.match(/<ButtonLink /g) ?? []).length, 4);
  });

  it("das Speaker-Detail trägt denselben Link im Seitenkopf, mit dem Text aus `adminSpeaker`", () => {
    const q = quelle(DETAIL);
    assert.match(q, /actions=\{\s+<ButtonLink href="\/admin\/speaker\/aufgaben" variant="ghost" size="sm">\s+\{t\.tasksLink\}\s+<\/ButtonLink>\s+\}/);
    // `t` ist `t.adminSpeaker` — derselbe Bereich wie in der Liste
    assert.match(quelle(DETAIL_SEITE), /\bt=\{t\.adminSpeaker\}/);
    assert.match(quelle(LISTE), /const ta = t\.adminSpeaker;/);
  });

  it("wer die Knöpfe sieht, darf auch das Ziel öffnen: Liste, Detail und Aufgabenseite prüfen denselben Admin-Abschnitt `speakers`", () => {
    assert.match(quelle(LISTE), /requireAdminSection\("speakers", "\/admin\/speaker"\)/);
    assert.match(quelle(DETAIL_SEITE), /requireAdminSection\("speakers", `\/admin\/speaker\/\$\{id\}`\)/);
    assert.match(quelle(AUFGABEN), /requireAdminSection\("speakers", "\/admin\/speaker\/aufgaben"\)/);
  });

  it("kein neuer Menüpunkt: die Seitenleiste kennt die Aufgabenseite genau einmal (wie seit SPK-024), ein zweiter Eintrag oder ein Abschnitt „Speakerportal“ käme erst nach K-95", () => {
    const nav = quelle("lib/admin-navigation.ts");
    assert.equal((nav.match(/href: "\/admin\/speaker\/aufgaben"/g) ?? []).length, 1);
    assert.match(nav, /\{ section: "speakers", href: "\/admin\/speaker\/aufgaben", label: "speakerTasks" \},/);
    assert.doesNotMatch(nav, /speakerPortal|speakerportal/i);
  });

  it("die Aufgabenseite selbst bleibt, wie sie war: Pflege je Edition mit den Funktionen aus 0149", () => {
    const q = quelle("app/(admin)/admin/speaker/aufgaben/AufgabenListe.tsx") + quelle("app/(admin)/admin/speaker/actions.ts");
    for (const rpc of ["speaker_tasks_admin", "upsert_speaker_task", "delete_speaker_task"]) assert.ok(q.includes(`"${rpc}"`) || quelle(AUFGABEN).includes(`"${rpc}"`), rpc);
  });

  it("Texte DE und EN", () => {
    const de = JSON.parse(quelle("lib/i18n/de.json")) as { adminSpeaker: Record<string, string> };
    const en = JSON.parse(quelle("lib/i18n/en.json")) as { adminSpeaker: Record<string, string> };
    assert.equal(de.adminSpeaker.tasksLink, "Aufgaben der Checkliste");
    assert.equal(en.adminSpeaker.tasksLink, "Checklist tasks");
  });
});

describe("ADM-067: Doku", () => {
  it("Testleitfaden: die Zeilen zur Speaker-Liste und zum Detail nennen den Knopf „Aufgaben der Checkliste“ und wohin er führt", () => {
    const zeilen = quelle("docs/team-testleitfaden.md").split("\n");
    const liste = zeilen.find((l) => l.startsWith("| `/admin/speaker` Speaker |"));
    const detail = zeilen.find((l) => l.startsWith("| `/admin/speaker/<id>` Detail |"));
    assert.ok(liste && detail, "Zeilen fehlen");
    assert.match(liste, /„Aufgaben der Checkliste“\*\* \(ADM-067: führt zu `\/admin\/speaker\/aufgaben`/);
    assert.match(detail, /Knopf „Aufgaben der Checkliste“ \(ADM-067:/);
    assert.match(detail, /gelten für alle Speaker der Edition/);
  });

  it("Backlog: ADM-067 trägt die PR-Nummer, nennt den Minimalweg und lässt die Vorlagen bei K-96", () => {
    const zeile = quelle("docs/feedback/admin.md").split("\n").find((l) => l.startsWith("| ADM-067 |"));
    assert.ok(zeile && /\| P1 \| (geplant|gebaut|abgenommen) #\d+/.test(zeile), "ADM-067 trägt keine PR-Nummer");
    assert.match(zeile, /Minimalweg/);
    assert.match(zeile, /K-96/);
    assert.match(zeile, /K-95/);
    assert.match(zeile, /keine Migration/);
  });
});
