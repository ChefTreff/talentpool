"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FileButton } from "@/components/ui/FileButton";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PortraitShape } from "@/components/ui/PortraitShape";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";
import { safeFileName } from "@/app/(partner)/partner/upload";
import {
  GAST_BUCKET,
  GAST_FOTO_MAX_BYTES,
  GAST_FOTO_MIME,
  gastFehlt,
  gastFotoPfad,
  gastName,
  type GastActions,
  type GastRow,
} from "./gaeste";

type Texte = Record<string, string>;
type Entwurf = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  organization: string;
  email: string;
  consent: boolean;
};
type Fehler = Partial<Record<keyof Entwurf | "photo", string>>;

const LEER: Entwurf = { firstName: "", lastName: "", jobTitle: "", organization: "", email: "", consent: false };

/**
 * Gäste einer Standbühne (PART-081) — **eine** Komponente für Partnerportal und
 * Admin (Regel vom 22.09.). Die Actions kommen von außen, die RPCs dahinter
 * sind dieselben (`lib/partner/gaeste.ts`).
 *
 * Konrads Antworten zu K-32: das Porträt ist Pflicht — beim Anlegen muss eins
 * gewählt sein, eine Zeile ohne Porträt trägt „Porträt fehlt“. Die
 * Einwilligung ist ein Haken mit Zeitstempel (Auflage der Architektur-Session).
 * Name und Adresse lassen sich nur bei selbst angelegten Personen ändern — die
 * Person gibt es plattformweit nur einmal (wie bei den Kontakten).
 *
 * Fehler aus dem Speichern stehen im Panel neben dem Knopf, nicht als Toast
 * hinter dem Dialog (ADM-041).
 */
export function Gaesteliste({
  orgId,
  gaeste,
  canManage,
  actions,
  mitKopf = true,
  dateLocale,
  t,
  rpcMessages,
}: {
  orgId: string;
  gaeste: GastRow[];
  /** `partner_can_edit` bzw. Partner-Team; sonst lesbar, ohne Knöpfe. */
  canManage: boolean;
  actions: GastActions;
  /** Überschrift, Satz und Knopf oben. Im Admin trägt die Karte ihren eigenen Kopf. */
  mitKopf?: boolean;
  dateLocale: string;
  t: Texte;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // null = zu, "neu" = anlegen, sonst der Gast, der bearbeitet wird.
  const [offen, setOffen] = useState<"neu" | GastRow | null>(null);
  const [entwurf, setEntwurf] = useState<Entwurf>(LEER);
  const [foto, setFoto] = useState<File | null>(null);
  const [fehler, setFehler] = useState<Fehler>({});
  const [serverFehler, setServerFehler] = useState<string | null>(null);
  const [entfernen, setEntfernen] = useState<GastRow | null>(null);

  const message = (key: string, detail?: string) =>
    (rpcMessages[key] ?? rpcMessages.unknown ?? key) + (detail ? ` (${detail})` : "");
  const datum = new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" });
  const bearbeitet = offen !== null && offen !== "neu" ? offen : null;
  const personFrei = offen === "neu" || (bearbeitet?.editable ?? false);

  function oeffnen(g: GastRow | "neu") {
    setEntwurf(
      g === "neu"
        ? LEER
        : {
            firstName: g.first_name ?? "",
            lastName: g.last_name ?? "",
            jobTitle: g.job_title ?? "",
            organization: g.organization_name ?? "",
            email: g.email ?? "",
            consent: true,
          },
    );
    setFoto(null);
    setFehler({});
    setServerFehler(null);
    setOffen(g);
  }

  function fotoWaehlen(file: File) {
    if (file.size > GAST_FOTO_MAX_BYTES) {
      setFehler((f) => ({ ...f, photo: t.photoTooBig }));
      return;
    }
    // Leerer Typ: der Browser kennt ihn nicht — Storage-Policy und RPC prüfen ohnehin Pfad und Recht.
    if (file.type && !GAST_FOTO_MIME.includes(file.type)) {
      setFehler((f) => ({ ...f, photo: t.photoWrongType }));
      return;
    }
    setFehler((f) => ({ ...f, photo: undefined }));
    setFoto(file);
  }

  /** Datei direkt in den Bucket, dann registrieren — wie beim Speaker-Foto (SPK-004). */
  async function fotoHochladen(profileId: string, editionId: string, file: File): Promise<boolean> {
    const supabase = createSupabaseBrowserClient();
    const pfad = gastFotoPfad(editionId, profileId, safeFileName(file.name), crypto.randomUUID());
    const { error } = await supabase.storage.from(GAST_BUCKET).upload(pfad, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) return false;
    const res = await actions.registerPhoto({
      profileId,
      storagePath: pfad,
      filename: file.name,
      mime: file.type || null,
      sizeBytes: file.size,
    });
    return res.ok;
  }

  function speichern() {
    const felder = gastFehlt(entwurf);
    const neu: Fehler = {};
    for (const f of felder) {
      // Name und Adresse eines fremden Profils stehen gar nicht zur Wahl; die prüfen wir nicht.
      if (!personFrei && (f === "firstName" || f === "lastName" || f === "email")) continue;
      neu[f] = f === "consent" ? rpcMessages.stage_guest_consent_required : t.required;
    }
    if (offen === "neu" && !foto) neu.photo = t.photoRequired;
    if (Object.keys(neu).length > 0) {
      setFehler(neu);
      return;
    }
    setFehler({});
    setServerFehler(null);
    startTransition(async () => {
      if (offen === "neu") {
        const res = await actions.add({ orgId, ...entwurf });
        if (!res.ok) {
          setServerFehler(message(res.key, res.detail));
          return;
        }
        const mitFoto = foto ? await fotoHochladen(res.data.profileId, res.data.editionId, foto) : false;
        toast(mitFoto ? "success" : "info", mitFoto ? t.added : t.addedWithoutPhoto);
      } else if (bearbeitet) {
        const res = await actions.update({
          profileId: bearbeitet.profile_id,
          jobTitle: entwurf.jobTitle,
          organization: entwurf.organization,
          ...(bearbeitet.editable
            ? { firstName: entwurf.firstName, lastName: entwurf.lastName, email: entwurf.email }
            : {}),
        });
        if (!res.ok) {
          setServerFehler(message(res.key, res.detail));
          return;
        }
        if (foto && !(await fotoHochladen(bearbeitet.profile_id, bearbeitet.edition_id, foto))) {
          setServerFehler(message("upload_failed"));
          router.refresh();
          return;
        }
        toast("success", t.saved);
      }
      setOffen(null);
      router.refresh();
    });
  }

  function entfernenBestaetigt(g: GastRow) {
    startTransition(async () => {
      const res = await actions.remove(g.profile_id);
      setEntfernen(null);
      if (!res.ok) {
        toast("error", message(res.key, res.detail));
        return;
      }
      toast("success", t.removed);
      router.refresh();
    });
  }

  const feld = (key: keyof Entwurf, label: string, extra?: { hint?: string; type?: string; disabled?: boolean }) => (
    <Field
      label={label}
      htmlFor={`gast-${key}`}
      hint={extra?.hint}
      error={fehler[key]}
      required
      requiredLabel={t.required}
    >
      <Input
        id={`gast-${key}`}
        type={extra?.type ?? "text"}
        value={String(entwurf[key])}
        disabled={pending || extra?.disabled}
        invalid={!!fehler[key]}
        onChange={(e) => setEntwurf((d) => ({ ...d, [key]: e.target.value }))}
      />
    </Field>
  );

  return (
    <div className="flex flex-col gap-4">
      {mitKopf && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-text">
            <h2 className="ct-h2 text-ink">{t.title}</h2>
            <p className="ct-help mt-1">{t.lead}</p>
          </div>
          {canManage && <Button onClick={() => oeffnen("neu")}>{t.add}</Button>}
        </div>
      )}
      {!mitKopf && canManage && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => oeffnen("neu")}>
            {t.add}
          </Button>
        </div>
      )}

      {gaeste.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Table>
          <Thead>
            <Th>{t.colPhoto}</Th>
            <Th>{t.colName}</Th>
            <Th>{t.colRole}</Th>
            <Th>{t.colSessions}</Th>
            {canManage && (
              <Th>
                <span className="sr-only">{t.colActions}</span>
              </Th>
            )}
          </Thead>
          <Tbody>
            {gaeste.map((g) => {
              const name = gastName(g);
              return (
                <Tr key={g.profile_id} controls>
                  <Td>
                    <div className="flex items-center gap-2">
                      <PortraitShape name={name || "?"} photoUrl={g.photo_url} size="sm" />
                      {!g.photo_url && (
                        <Badge tone="warning" className="whitespace-nowrap">
                          {t.photoMissing}
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="ct-label text-ink">{name}</span>
                    {g.email && <span className="block ct-help">{g.email}</span>}
                  </Td>
                  <Td className="text-ink">
                    {[g.job_title, g.organization_name].filter(Boolean).join(" · ")}
                  </Td>
                  <Td>
                    {g.sessions.length > 0 ? (
                      <ul className="flex flex-col gap-0.5">
                        {g.sessions.map((s) => (
                          <li key={s.session_id} className="ct-small text-ink">
                            {s.title_de ?? "—"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="ct-help">{t.noSessions}</span>
                    )}
                  </Td>
                  {canManage && (
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => oeffnen(g)}>
                          {t.edit}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEntfernen(g)}>
                          {t.remove}
                        </Button>
                      </div>
                    </Td>
                  )}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}

      <Drawer
        open={offen !== null}
        onClose={() => setOffen(null)}
        title={offen === "neu" ? t.addTitle : t.editTitle}
        error={serverFehler}
        closeLabel={t.cancel}
        footer={
          <div className="flex gap-2">
            <Button onClick={speichern} loading={pending}>
              {t.save}
            </Button>
            <Button variant="ghost" onClick={() => setOffen(null)}>
              {t.cancel}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {!personFrei && <p className="ct-help">{t.notEditableHint}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {feld("firstName", t.firstName, { disabled: !personFrei })}
            {feld("lastName", t.lastName, { disabled: !personFrei })}
          </div>
          {feld("jobTitle", t.jobTitle)}
          {feld("organization", t.organization)}
          {personFrei && feld("email", t.email, { type: "email", hint: t.emailHint })}

          <Field label={t.photo} htmlFor="gast-foto" error={fehler.photo} required requiredLabel={t.required}>
            <div className="flex flex-wrap items-center gap-4">
              {bearbeitet && (
                <PortraitShape name={gastName(bearbeitet) || "?"} photoUrl={bearbeitet.photo_url} size="sm" />
              )}
              <FileButton
                label={foto ? foto.name : bearbeitet?.photo_url ? t.photoReplace : t.photoUpload}
                accept={GAST_FOTO_MIME.join(",")}
                disabled={pending}
                hint={t.photoHint}
                onFile={fotoWaehlen}
              />
            </div>
          </Field>

          {offen === "neu" ? (
            <div>
              <label htmlFor="gast-consent" className="flex items-start gap-3">
                <input
                  id="gast-consent"
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={entwurf.consent}
                  disabled={pending}
                  aria-invalid={!!fehler.consent || undefined}
                  onChange={(e) => setEntwurf((d) => ({ ...d, consent: e.target.checked }))}
                />
                <span className="ct-small text-ink">
                  {t.consent}
                  <span aria-hidden className="ml-0.5 text-error-ink">
                    *
                  </span>
                </span>
              </label>
              {fehler.consent && <p className="ct-help mt-1 text-error-ink">{fehler.consent}</p>}
            </div>
          ) : (
            bearbeitet?.consent_at && (
              <p className="ct-help">{t.consentSince.replace("{date}", datum.format(new Date(bearbeitet.consent_at)))}</p>
            )
          )}
        </div>
      </Drawer>

      {entfernen && (
        <ConfirmDialog
          title={t.removeTitle}
          body={t.removeBody.replace("{name}", gastName(entfernen))}
          confirmLabel={t.removeConfirm}
          cancelLabel={t.cancel}
          pending={pending}
          onConfirm={() => entfernenBestaetigt(entfernen)}
          onCancel={() => setEntfernen(null)}
        />
      )}
    </div>
  );
}
