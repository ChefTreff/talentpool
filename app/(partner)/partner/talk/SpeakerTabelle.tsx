"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { Field } from "@/components/ui/Field";
import { Input, Textarea } from "@/components/ui/Input";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { updateTalkSpeaker } from "../actions";
import type { PartnerSpeaker } from "./types";

type Strings = Record<string, string>;

/**
 * Die Speaker eines Slots als Tabelle (PART-136, Konrad 08.10.2026, K-73).
 *
 * Eine Zeile je Person: Name mit Zweitzeile, der Stand als Marken, und — nur wenn der Partner pflegen darf —
 * der Knopf zum Bearbeiten. Das Formular steht **nicht mehr in der Liste**, sondern im Schubfach; die Liste bleibt
 * beim Bearbeiten dicht, und eine Meldung zum Speichern steht im Schubfach neben dem Knopf (`Drawer error`,
 * ADM-062), nicht als Toast hinter dem Dialog.
 *
 * **Das Recht endet mit dem ersten Login der Speakerin** (`can_edit`, Trigger aus 0132): danach gibt es keinen
 * Knopf, und die Zweitzeile fehlt (die RPC liefert Position und Unternehmen dann nicht mehr — es sind ihre
 * Angaben). Was für alle gilt — wer sich selbst pflegt, wer über den Operations-Kontakt läuft — steht **einmal**
 * unter der Tabelle (`page.tsx`), nicht bei jedem Namen.
 *
 * Die Karte `SpeakerKarte` bleibt für die Masterclass-Seite; hier ersetzt die Tabelle sie nur auf der Talk-Seite.
 */
export function SpeakerTabelle({
  speakers,
  canEdit,
  t,
  rpcMessages,
}: {
  speakers: PartnerSpeaker[];
  /** Rolle in der Organisation. Ohne sie ist die Tabelle nur Anzeige. */
  canEdit: boolean;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const aktiv = speakers.find((s) => s.profile_id === offen) ?? null;

  return (
    <>
      <Table stapeln>
        <Thead>
          <Th>{t.colPerson}</Th>
          <Th>{t.colStatus}</Th>
          <Th aria-label={t.colAction} />
        </Thead>
        <Tbody>
          {speakers.map((sp) => {
            const darfPflegen = canEdit && sp.can_edit;
            // Position und Unternehmen kennt die RPC nur, solange der Partner pflegen darf.
            const zweitzeile = sp.can_edit
              ? [sp.job_title, sp.organization_name].filter(Boolean).join(" · ") || t.noRoleYet
              : null;
            return (
              <Tr key={sp.profile_id}>
                <Td>
                  <span className="ct-label text-ink">{sp.display_name || t.unnamed}</span>
                  {zweitzeile && <span className="ct-help mt-0.5 block">{zweitzeile}</span>}
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    {sp.confirmed && <Badge tone="success">{t.confirmed}</Badge>}
                    {sp.mail_contact_name ? (
                      <Badge tone="accent">{t.managedBadge}</Badge>
                    ) : (
                      !sp.can_edit && <Badge tone="neutral">{t.ownsData}</Badge>
                    )}
                  </span>
                </Td>
                <Td>
                  {darfPflegen && (
                    <Button size="sm" variant="secondary" onClick={() => setOffen(sp.profile_id)}>
                      {t.edit}
                    </Button>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>

      {aktiv && (
        <SpeakerBearbeiten
          key={aktiv.profile_id}
          speaker={aktiv}
          onClose={() => setOffen(null)}
          t={t}
          rpcMessages={rpcMessages}
        />
      )}
    </>
  );
}

/** Das Schubfach mit den acht Feldern — dieselben wie vorher in der Liste. Der Entwurf lebt nur, solange es offen ist. */
function SpeakerBearbeiten({
  speaker,
  onClose,
  t,
  rpcMessages,
}: {
  speaker: PartnerSpeaker;
  onClose: () => void;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    // Getrennt aus der RPC, nicht aus dem Anzeigenamen zerlegt: „Anna von der
    // Heide" wäre sonst beim Speichern zu Vorname „Anna von der" geworden.
    first_name: speaker.first_name ?? "",
    last_name: speaker.last_name ?? "",
    title: speaker.title ?? "",
    job_title: speaker.job_title ?? "",
    organization_name: speaker.organization_name ?? "",
    bio_short_de: speaker.bio_short_de ?? "",
    bio_short_en: speaker.bio_short_en ?? "",
    linkedin_url: speaker.linkedin_url ?? "",
  });
  const id = speaker.profile_id;

  function speichern() {
    setFehler(null);
    startSaving(async () => {
      const res = await updateTalkSpeaker({
        profileId: speaker.profile_id,
        // Leere Felder werden zu null: „nicht gesetzt" statt leerer Text.
        fields: Object.fromEntries(
          Object.entries(draft).map(([k, v]) => [k, v.trim() === "" ? null : v.trim()]),
        ),
      });
      if (!res.ok) {
        setFehler(rpcMessages[res.key] ?? rpcMessages.unknown ?? res.key);
        return;
      }
      toast("success", t.saved);
      onClose();
      router.refresh();
    });
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={t.editTitle.replace("{name}", speaker.display_name || t.unnamed)}
      error={fehler}
      footer={
        <div className="flex flex-wrap gap-2">
          <Button onClick={speichern} disabled={saving}>
            {saving ? t.saving : t.save}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          speichern();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.firstName} htmlFor={`fn-${id}`}>
            <Input id={`fn-${id}`} value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
          </Field>
          <Field label={t.lastName} htmlFor={`ln-${id}`}>
            <Input id={`ln-${id}`} value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
          </Field>
          <Field label={t.academicTitle} htmlFor={`ti-${id}`} hint={t.academicTitleHint}>
            <Input id={`ti-${id}`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label={t.jobTitle} htmlFor={`jt-${id}`}>
            <Input id={`jt-${id}`} value={draft.job_title} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} />
          </Field>
          <Field label={t.organization} htmlFor={`or-${id}`}>
            <Input id={`or-${id}`} value={draft.organization_name} onChange={(e) => setDraft({ ...draft, organization_name: e.target.value })} />
          </Field>
          <Field label={t.linkedin} htmlFor={`li-${id}`}>
            <Input id={`li-${id}`} type="url" value={draft.linkedin_url} onChange={(e) => setDraft({ ...draft, linkedin_url: e.target.value })} />
          </Field>
        </div>
        <Field label={t.bioDe} htmlFor={`bd-${id}`} hint={t.bioHint}>
          <Textarea id={`bd-${id}`} rows={3} value={draft.bio_short_de} onChange={(e) => setDraft({ ...draft, bio_short_de: e.target.value })} />
        </Field>
        <Field label={t.bioEn} htmlFor={`be-${id}`}>
          <Textarea id={`be-${id}`} rows={3} value={draft.bio_short_en} onChange={(e) => setDraft({ ...draft, bio_short_en: e.target.value })} />
        </Field>
        <p className="ct-help">{t.privateFields}</p>
      </form>
    </Drawer>
  );
}
