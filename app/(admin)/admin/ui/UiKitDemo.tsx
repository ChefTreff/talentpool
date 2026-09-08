"use client";

import { useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
  Stepper,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Textarea,
  Tr,
  useToast,
} from "@/components/ui";

type Labels = {
  buttons: string;
  forms: string;
  badges: string;
  table: string;
  cards: string;
  overlays: string;
  empty: string;
  stepper: string;
  typography: string;
  colors: string;
  openDrawer: string;
  showToast: string;
  toastText: string;
  drawerTitle: string;
  save: string;
  cancel: string;
  close: string;
  required: string;
  choose: string;
  active: string;
};

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <Card>
        <h2 className="ct-h2 mb-4 text-ink">{title}</h2>
        {children}
      </Card>
    </section>
  );
}

const SWATCHES: { name: string; varName: string; onDark?: boolean }[] = [
  { name: "navy", varName: "--ct-navy", onDark: true },
  { name: "canvas", varName: "--ct-canvas" },
  { name: "surface", varName: "--ct-surface" },
  { name: "border", varName: "--ct-border" },
  { name: "muted", varName: "--ct-muted", onDark: true },
  { name: "accent", varName: "--ct-accent", onDark: true },
  { name: "accent-strong", varName: "--ct-accent-strong", onDark: true },
  { name: "accent-soft", varName: "--ct-accent-soft" },
  { name: "success", varName: "--ct-success" },
  { name: "warning", varName: "--ct-warning" },
  { name: "error", varName: "--ct-error", onDark: true },
];

export function UiKitDemo({ t }: { t: Labels }) {
  const [drawer, setDrawer] = useState(false);
  const [step, setStep] = useState(1);
  const toast = useToast();

  return (
    <div className="max-w-[1000px]">
      <Block title={t.buttons}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
        </div>
      </Block>

      <Block title={t.forms}>
        <div className="grid max-w-[640px] gap-4">
          <Field label="Text" htmlFor="d-text" hint="Hilfetext unter dem Feld.">
            <Input id="d-text" placeholder="Platzhalter" />
          </Field>
          <Field
            label="Pflichtfeld"
            htmlFor="d-req"
            required
            requiredLabel={t.required}
          >
            <Input id="d-req" />
          </Field>
          <Field label="Mit Fehler" htmlFor="d-err" error="Bitte eine E-Mail angeben.">
            <Input id="d-err" invalid defaultValue="keine-mail" />
          </Field>
          <Field label="Auswahl" htmlFor="d-sel">
            <Select
              id="d-sel"
              placeholder={t.choose}
              options={[
                { value: "a", label: "Option A" },
                { value: "b", label: "Option B" },
              ]}
            />
          </Field>
          <Field label="Mehrzeilig" htmlFor="d-area">
            <Textarea id="d-area" rows={3} />
          </Field>
          <Field label="Deaktiviert" htmlFor="d-dis">
            <Input id="d-dis" disabled defaultValue="nicht bearbeitbar" />
          </Field>
        </div>
      </Block>

      <Block title={t.badges}>
        <div className="flex flex-wrap gap-2">
          <Badge>neutral</Badge>
          <Badge tone="accent">akzent</Badge>
          <Badge tone="success">✓ bestätigt</Badge>
          <Badge tone="warning">⏳ offen</Badge>
          <Badge tone="error">! überfällig</Badge>
        </div>
      </Block>

      <Block title={t.stepper}>
        <Stepper
          current={step}
          steps={[{ label: "Basis" }, { label: "Karriere" }, { label: "Interessen" }]}
        />
        <div className="mt-4 flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            −
          </Button>
          <Button size="sm" onClick={() => setStep((s) => Math.min(2, s + 1))}>
            +
          </Button>
        </div>
      </Block>

      <Block title={t.cards}>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Personen" value={1284} />
          <StatCard label="Bewerbungen" value={312} hint="letzte 7 Tage" />
          <StatCard label="Offene Slots" value={7} />
        </div>
      </Block>

      <Block title={t.table}>
        <Table>
          <Thead>
            <Th>Name</Th>
            <Th>Status</Th>
            <Th numeric>Score</Th>
          </Thead>
          <Tbody>
            <Tr>
              <Td>Alexis Fischer</Td>
              <Td>
                <Badge tone="success">bestätigt</Badge>
              </Td>
              <Td numeric>92</Td>
            </Tr>
            <Tr>
              <Td>Kim Neumann</Td>
              <Td>
                <Badge tone="warning">offen</Badge>
              </Td>
              <Td numeric>74</Td>
            </Tr>
          </Tbody>
        </Table>
      </Block>

      <Block title={t.overlays}>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            {t.openDrawer}
          </Button>
          <Button variant="secondary" onClick={() => toast("success", t.toastText)}>
            {t.showToast}
          </Button>
        </div>
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          title={t.drawerTitle}
          closeLabel={t.close}
          footer={
            <div className="flex gap-2">
              <Button onClick={() => setDrawer(false)}>{t.save}</Button>
              <Button variant="ghost" onClick={() => setDrawer(false)}>
                {t.cancel}
              </Button>
            </div>
          }
        >
          <Field label="Titel" htmlFor="d-drawer">
            <Input id="d-drawer" defaultValue="Masterclass: Supply Chain" />
          </Field>
        </Drawer>
      </Block>

      <Block title={t.empty}>
        <EmptyState
          title="Noch keine Einträge"
          description="Sobald der erste Datensatz angelegt ist, erscheint er hier."
          action={<Button>Anlegen</Button>}
        />
      </Block>

      <Block title={t.typography}>
        <p className="ct-eyebrow text-muted">Eyebrow 12/16</p>
        <h3 className="ct-h1 mt-2 text-ink">Seitentitel H1</h3>
        <h4 className="ct-h2 mt-3 text-ink">Sektions-Header H2</h4>
        <h5 className="ct-h3 mt-3 text-ink">Karten-Titel H3</h5>
        <p className="mt-3 max-w-[70ch]">
          Fließtext in Sharp Sans SemiBold, 15/24. Zahlen laufen tabellarisch:
          <span className="tabular-nums"> 1.284 · 312 · 7</span>. Ein{" "}
          <a href="#" className="ct-link">
            Inline-Link
          </a>{" "}
          trägt den Akzent.
        </p>
        <p className="ct-laica mt-3 text-muted">Ein Laica-Moment pro Screen.</p>
      </Block>

      <Block title={t.colors}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((s) => (
            <li key={s.name} className="rounded-ct-md border p-2">
              <div
                className="h-12 rounded-ct-sm border"
                style={{ background: `var(${s.varName})` }}
              />
              <p className="mt-2 font-mono text-[12px] text-muted">{s.name}</p>
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}
