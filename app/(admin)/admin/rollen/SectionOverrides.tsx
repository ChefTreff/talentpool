"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Thead, Tbody, Tr, Th, Td } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import {
  removeSectionOverride,
  setSectionOverride,
  type FoundPerson,
  type SectionOverrideRow,
} from "./actions";

type Strings = Record<string, string>;

/**
 * Abschnitte je Rolle und je Person an- und ausschalten (ADM-053, Konrad 24.09.).
 *
 * Die **Vorgabe** — welche Rolle welchen Abschnitt öffnet — steht im Code
 * (`lib/admin-sections.ts`) und ist dort nachlesbar. Hier stehen nur die
 * **Ausnahmen**: Person schlägt Rolle, Rolle schlägt Vorgabe. Deshalb zeigt die
 * Tabelle je Zeile auch, was ohne sie gälte — sonst weiss niemand, ob eine
 * Ausnahme noch etwas bewirkt.
 *
 * `admin` fehlt in der Rollenauswahl mit Absicht: die Rolle sieht immer alles,
 * und eine Ausnahme darauf wäre wirkungslos. Die RPC weist sie ebenfalls ab.
 */
export function SectionOverrides({
  overrides,
  sections,
  vorgabe,
  roles,
  person,
  t,
  common,
  rpcMessages,
}: {
  overrides: SectionOverrideRow[];
  /** Abschnittsschlüssel mit Beschriftung, in der Reihenfolge der Seitenleiste. */
  sections: { key: string; label: string }[];
  /** Je Abschnitt die Rollen, die ihn **ohne** Ausnahme öffnen. */
  vorgabe: Record<string, readonly string[]>;
  roles: Record<string, string>;
  /** Die im Rollen-Bereich gewählte Person — für eine persönliche Ausnahme. */
  person: FoundPerson | null;
  t: Strings;
  common: { choose: string; none: string; save: string };
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState("");
  const [ziel, setZiel] = useState<"role" | "person">("role");
  const [role, setRole] = useState("");
  const [allowed, setAllowed] = useState(true);
  const [note, setNote] = useState("");

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;
  const label = (key: string) => sections.find((s) => s.key === key)?.label ?? key;

  function onSave() {
    if (!section) return;
    if (ziel === "role" && !role) return;
    if (ziel === "person" && !person) return;
    startTransition(async () => {
      const res = await setSectionOverride({
        section,
        allowed,
        role: ziel === "role" ? role : null,
        personId: ziel === "person" ? person!.id : null,
        note,
      });
      if (!res.ok) {
        toast("error", message(res.key) + (res.detail ? ` (${res.detail})` : ""));
        return;
      }
      setSection("");
      setRole("");
      setNote("");
      toast("success", t.overrideSaved);
      router.refresh();
    });
  }

  function onRemove(id: string) {
    startTransition(async () => {
      const res = await removeSectionOverride(id);
      if (!res.ok) {
        toast("error", message(res.key));
        return;
      }
      toast("success", t.overrideRemoved);
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      <h2 className="ct-h2 mb-1 text-ink">{t.overrideTitle}</h2>
      <p className="ct-help mb-4">{t.overrideHint}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t.overrideSection} htmlFor="ov-section">
          <Select
            id="ov-section"
            value={section}
            placeholder={common.choose}
            options={sections.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(e) => setSection(e.target.value)}
          />
        </Field>
        <Field label={t.overrideTarget} htmlFor="ov-target" hint={person ? undefined : t.overridePersonHint}>
          <Select
            id="ov-target"
            value={ziel}
            options={[
              { value: "role", label: t.overrideTargetRole },
              // Ohne gewählte Person gibt es nichts, worauf sich „diese Person"
              // beziehen könnte — dann bleibt nur die Rolle.
              ...(person ? [{ value: "person", label: `${t.overrideTargetPerson}: ${person.display_name ?? person.id}` }] : []),
            ]}
            onChange={(e) => setZiel(e.target.value as "role" | "person")}
          />
        </Field>
        {ziel === "role" && (
          <Field label={t.role} htmlFor="ov-role">
            <Select
              id="ov-role"
              value={role}
              placeholder={common.choose}
              options={Object.entries(roles)
                .filter(([value]) => value !== "admin")
                .map(([value, label]) => ({ value, label }))}
              onChange={(e) => setRole(e.target.value)}
            />
          </Field>
        )}
        <Field label={t.overrideAllowed} htmlFor="ov-allowed">
          <Select
            id="ov-allowed"
            value={allowed ? "on" : "off"}
            options={[
              { value: "on", label: t.overrideOn },
              { value: "off", label: t.overrideOff },
            ]}
            onChange={(e) => setAllowed(e.target.value === "on")}
          />
        </Field>
        <Field label={t.note} htmlFor="ov-note">
          <Input id="ov-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {section && (
        <p className="ct-help mt-3">
          {t.overrideDefault.replace(
            "{roles}",
            (vorgabe[section] ?? []).length > 0
              ? (vorgabe[section] ?? []).map((r) => roles[r] ?? r).join(", ")
              : t.overrideDefaultAdminOnly,
          )}
        </p>
      )}

      <div className="mt-4">
        <Button disabled={pending || !section || (ziel === "role" ? !role : !person)} onClick={onSave}>
          {common.save}
        </Button>
      </div>

      {overrides.length > 0 && (
        <div className="mt-6">
          <Table>
            <Thead>
              <Th>{t.overrideSection}</Th>
              <Th>{t.overrideTarget}</Th>
              <Th>{t.overrideAllowed}</Th>
              <Th>{t.note}</Th>
              <Th aria-label={common.none} />
            </Thead>
            <Tbody>
              {overrides.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <span className="ct-label text-ink">{label(o.section)}</span>
                  </Td>
                  <Td className="text-muted">
                    {o.role ? (roles[o.role] ?? o.role) : (o.person_name ?? o.person_id)}
                  </Td>
                  <Td>
                    <Badge tone={o.allowed ? "success" : "neutral"}>
                      {o.allowed ? t.overrideOn : t.overrideOff}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{o.note ?? ""}</Td>
                  <Td>
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => onRemove(o.id)}>
                      {t.overrideRemove}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
