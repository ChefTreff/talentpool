"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { useUrlFilter } from "@/components/ui/useUrlFilter";
import { ladeVerlauf, setProducts, setStage, type VerlaufZeile } from "./actions";
import { STAGES, type IniProdukt, type Initiative } from "./types";

type Strings = Record<string, string>;

const TONES: Record<string, BadgeTone> = {
  agreement: "accent",
  onboarding: "accent",
  aktiv: "success",
  abgelehnt: "neutral",
};

/**
 * Funnel und Leistungen einer Initiative.
 *
 * Die Stufe ist ein Auswahlfeld in der Zeile und kein eigener Dialog: sie
 * ändert sich oft, und ein Funnel, bei dem jeder Schritt drei Klicks kostet,
 * wird nicht gepflegt. Die Leistungen stehen dagegen im Schubfach — sie
 * ersetzen den vorherigen Stand, und das gehört nicht neben ein Auswahlfeld.
 *
 * **Überblick je Stufe (QS-065):** oben steht je Stufe die Zahl, ein Klick filtert
 * die Liste (Adresszeile `?stufe=`, auch als Link teilbar). Vorher gab es weder
 * Zählung noch Filter, und vier Karten füllten den Bildschirm.
 */
export function InitiativenView({
  initiativen,
  angebot,
  dateLocale,
  t,
  stageLabels,
  common,
  rpcMessages,
}: {
  initiativen: Initiative[];
  angebot: IniProdukt[];
  dateLocale: string;
  t: Strings;
  stageLabels: Record<string, string>;
  common: { save: string; cancel: string; none: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [offen, setOffen] = useState<Initiative | null>(null);
  const [mengen, setMengen] = useState<Record<string, number>>({});
  // ADM-022: Verlauf und Notiz je Initiative.
  const [verlauf, setVerlauf] = useState<{ i: Initiative; zeilen: VerlaufZeile[] } | null>(null);
  const [notiz, setNotiz] = useState("");
  const [f, setF] = useUrlFilter({ stufe: "" }, { stufe: "stufe" });

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function stufe(i: Initiative, wert: string) {
    start(async () => {
      const res = await setStage(i.org_edition_id, wert);
      if (!res.ok) toast("error", message(res.key));
      else router.refresh();
    });
  }

  function oeffneVerlauf(i: Initiative) {
    start(async () => {
      const res = await ladeVerlauf(i.org_edition_id);
      if (!res.ok) { toast("error", message(res.key)); return; }
      setNotiz("");
      setVerlauf({ i, zeilen: res.zeilen });
    });
  }

  function notizSpeichern() {
    if (!verlauf || !notiz.trim()) return;
    const { i } = verlauf;
    start(async () => {
      const res = await setStage(i.org_edition_id, i.pipeline_stage ?? "", notiz);
      if (!res.ok) { toast("error", message(res.key)); return; }
      const neu = await ladeVerlauf(i.org_edition_id);
      setNotiz("");
      if (neu.ok) setVerlauf({ i, zeilen: neu.zeilen });
      toast("success", t.noteSaved);
      router.refresh();
    });
  }

  function leistungen() {
    if (!offen) return;
    const items = Object.entries(mengen)
      .filter(([, qty]) => qty > 0)
      .map(([sku, qty]) => ({ sku, qty }));
    start(async () => {
      const res = await setProducts(offen.org_edition_id, items);
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      toast("success", t.productsSaved.replace("{n}", String(res.n ?? items.length)));
      setOffen(null);
      router.refresh();
    });
  }

  const OHNE = "ohne";
  const zaehle = (stufeKey: string) =>
    initiativen.filter((i) => (stufeKey === OHNE ? !i.pipeline_stage : i.pipeline_stage === stufeKey)).length;
  const stufenFilter = [
    { wert: "", label: t.stageAll, n: initiativen.length },
    ...STAGES.map((s) => ({ wert: s as string, label: stageLabels[s] ?? s, n: zaehle(s) })),
    ...(zaehle(OHNE) > 0 ? [{ wert: OHNE, label: t.noStage, n: zaehle(OHNE) }] : []),
  ];
  const sichtbar = f.stufe
    ? initiativen.filter((i) => (f.stufe === OHNE ? !i.pipeline_stage : i.pipeline_stage === f.stufe))
    : initiativen;

  return (
    <>
      <div role="group" aria-label={t.stageOverview} className="mb-4 flex flex-wrap gap-2">
        {stufenFilter.map((x) => (
          <Button
            key={x.wert || "alle"}
            size="sm"
            variant={f.stufe === x.wert ? "secondary" : "ghost"}
            aria-pressed={f.stufe === x.wert}
            onClick={() => setF({ stufe: x.wert })}
          >
            {x.label} <span className="tabular-nums">· {x.n}</span>
          </Button>
        ))}
      </div>
      {sichtbar.length === 0 && <p className="ct-small text-muted">{t.stageEmpty}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {sichtbar.map((i) => (
          <Card key={i.org_edition_id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="ct-label">{i.org_name}</p>
                <p className="ct-help text-muted">
                  {i.website ?? common.none}
                  {i.source !== "hubspot" && ` · ${t.sourcePortal}`}
                </p>
              </div>
              <div className="w-50">
                <Select
                  aria-label={t.stage}
                  placeholder={t.noStage}
                  options={STAGES.map((s) => ({ value: s, label: stageLabels[s] ?? s }))}
                  value={i.pipeline_stage ?? ""}
                  disabled={pending}
                  onChange={(e) => stufe(i, e.target.value)}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {i.pipeline_stage && (
                <Badge tone={TONES[i.pipeline_stage] ?? "neutral"}>
                  {stageLabels[i.pipeline_stage] ?? i.pipeline_stage}
                </Badge>
              )}
              <span className="ct-help text-muted">
                {t.counts
                  .replace("{produkte}", String(i.produkte))
                  .replace("{pflichten}", String(i.pflichten_offen))
                  .replace("{kontingente}", String(i.kontingente))}
              </span>
              <span className="ct-help text-muted">
                {t.updated.replace("{date}", zeit.format(new Date(i.updated_at)))}
              </span>
            </div>

            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setOffen(i);
                  setMengen({});
                }}
              >
                {t.editProducts}
              </Button>
              <Button size="sm" variant="ghost" className="ml-2" disabled={pending} onClick={() => oeffneVerlauf(i)}>
                {t.history}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Drawer
        open={verlauf !== null}
        onClose={() => setVerlauf(null)}
        title={verlauf ? t.historyTitle.replace("{name}", verlauf.i.org_name) : t.historyTitle}
        footer={
          <div className="flex gap-2">
            <Button onClick={notizSpeichern} disabled={pending || !notiz.trim()}>
              {t.noteSave}
            </Button>
            <Button variant="ghost" onClick={() => setVerlauf(null)}>
              {common.cancel}
            </Button>
          </div>
        }
      >
        <Field label={t.note} htmlFor="ini-notiz" hint={t.noteHint}>
          <Textarea id="ini-notiz" rows={4} maxLength={2000} value={notiz} onChange={(e) => setNotiz(e.target.value)} />
        </Field>
        {verlauf && verlauf.zeilen.length === 0 ? (
          <p className="ct-small mt-4 text-muted">{t.historyEmpty}</p>
        ) : (
          <ol className="mt-4 flex flex-col divide-y">
            {verlauf?.zeilen.map((z, n) => (
              <li key={n} className="py-3">
                <p className="ct-help text-muted">
                  {zeit.format(new Date(z.changed_at))}
                  {z.changed_by_name ? ` · ${z.changed_by_name}` : ""}
                </p>
                <p className="ct-small">
                  {z.stage ? (stageLabels[z.stage] ?? z.stage) : t.noStage}
                </p>
                {z.note && <p className="ct-small mt-1 whitespace-pre-line">{z.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </Drawer>

      <Drawer
        open={offen !== null}
        onClose={() => setOffen(null)}
        title={offen ? t.productsTitle.replace("{name}", offen.org_name) : t.productsTitle}
        footer={
          <div className="flex gap-2">
            <Button onClick={leistungen} disabled={pending}>
              {common.save}
            </Button>
            <Button variant="ghost" onClick={() => setOffen(null)}>
              {common.cancel}
            </Button>
          </div>
        }
      >
        {/* Die Warnung steht vor der Liste, nicht hinter dem Knopf: wer hier
            speichert, ersetzt den vereinbarten Stand. */}
        <p className="rounded-ct-md border border-warning-soft bg-warning-soft p-3 ct-small text-warning-ink">
          {t.productsReplaceHint}
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {angebot.map((p) => (
            <Field key={p.sku} label={p.name} htmlFor={`m-${p.sku}`} hint={p.sku}>
              <Input
                id={`m-${p.sku}`}
                type="number"
                min={0}
                max={99}
                value={mengen[p.sku] ?? 0}
                onChange={(e) =>
                  setMengen({ ...mengen, [p.sku]: Number(e.target.value) || 0 })
                }
              />
            </Field>
          ))}
        </div>
      </Drawer>
    </>
  );
}
