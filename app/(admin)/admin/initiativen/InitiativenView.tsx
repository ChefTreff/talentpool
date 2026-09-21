"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { setProducts, setStage } from "./actions";
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

  const zeit = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  function stufe(i: Initiative, wert: string) {
    start(async () => {
      const res = await setStage(i.org_edition_id, wert);
      if (!res.ok) toast("error", message(res.key));
      else router.refresh();
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

  return (
    <>
      <div className="flex flex-col gap-4">
        {initiativen.map((i) => (
          <Card key={i.org_edition_id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="ct-label">{i.org_name}</p>
                <p className="ct-help text-muted">
                  {i.website ?? common.none}
                  {i.source !== "hubspot" && ` · ${t.sourcePortal}`}
                </p>
              </div>
              <div className="w-[200px]">
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
            </div>
          </Card>
        ))}
      </div>

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
