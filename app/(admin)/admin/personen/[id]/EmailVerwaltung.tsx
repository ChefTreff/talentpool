"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal, ModalFuss } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { manageEmail, type EmailAction } from "./actions";

type Strings = Record<string, string>;
export type PersonEmail = { id: string; email: string; type: string; is_primary: boolean; verified: boolean };

type Dialog =
  | { art: "add" }
  | { art: "change"; mail: PersonEmail }
  | { art: "remove"; mail: PersonEmail };

/**
 * Die Adressen einer Person (ADM-092): weitere hinzufügen, eine als primär setzen,
 * eine berichtigen, eine nicht-primäre entfernen.
 *
 * **Berichtigen nur ohne Login.** Mit Konto steht die Anmeldeadresse zusätzlich in
 * der Anmeldung; änderte man nur die Person, passten beide nicht mehr zusammen.
 * Die Funktion lehnt das ab (`login_email_locked`), die Oberfläche bietet den
 * Knopf gar nicht erst an und sagt stattdessen, was geht. Ist eine Adresse schon
 * bei einer anderen Person, verweist die Meldung dorthin — der Weg ist
 * „Dubletten“, nicht Überschreiben.
 */
export function EmailVerwaltung({
  personId,
  mails,
  hasLogin,
  readOnly,
  t,
  common,
  rpcMessages,
}: {
  personId: string;
  mails: PersonEmail[];
  hasLogin: boolean;
  /** Anonymisierte Personen: die Funktion lehnt jede Änderung ab, die Knöpfe fehlen gleich. */
  readOnly: boolean;
  t: Strings;
  common: { cancel: string; save: string };
  rpcMessages: Strings;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [adresse, setAdresse] = useState("");
  const [fehler, setFehler] = useState<{ text: string; besitzer?: string } | null>(null);

  const zu = () => {
    setDialog(null);
    setAdresse("");
    setFehler(null);
  };
  const melden = (key: string, detail?: string) =>
    setFehler({
      text: rpcMessages[key] ?? rpcMessages.unknown ?? key,
      besitzer: key === "person_email_taken" ? detail : undefined,
    });

  function ausfuehren(action: EmailAction, mail: PersonEmail | null, neu: string | null, erfolg: string) {
    start(async () => {
      const res = await manageEmail(personId, action, mail?.id ?? null, neu);
      if (!res.ok) {
        melden(res.key, res.detail);
        return;
      }
      zu();
      toast("success", erfolg);
      router.refresh();
    });
  }

  // Die Meldung steht im Fenster (`error`); der Link zur anderen Person kann dort kein Text sein und steht im Inhalt.
  const besitzerLink = fehler?.besitzer && (
    <p className="ct-small mt-3">
      <Link className="ct-link" href={`/admin/personen/${fehler.besitzer}`}>
        {t.emailOwnerLink}
      </Link>
    </p>
  );

  return (
    <>
      <ul className="ct-small">
        {mails.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 py-1">
            <span>{m.email}</span>
            {m.is_primary && <Badge tone="accent">{t.primary}</Badge>}
            <span className="text-muted">{m.type}</span>
            {m.verified && <Badge tone="success">{t.verified}</Badge>}
            {!readOnly && (
            <span className="ml-auto flex flex-wrap gap-1">
              {!m.is_primary && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => ausfuehren("primary", m, null, t.emailPrimarySet)}>
                  {t.emailMakePrimary}
                </Button>
              )}
              {!hasLogin && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setFehler(null); setAdresse(m.email); setDialog({ art: "change", mail: m }); }}>
                  {t.emailChange}
                </Button>
              )}
              {!m.is_primary && (
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setFehler(null); setDialog({ art: "remove", mail: m }); }}>
                  {t.emailRemove}
                </Button>
              )}
            </span>
            )}
          </li>
        ))}
        {mails.length === 0 && <li className="text-muted">{t.noEmails}</li>}
      </ul>
      {hasLogin && !readOnly && <p className="ct-help mt-2">{t.emailLoginHint}</p>}
      {!readOnly && (
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={() => { setFehler(null); setAdresse(""); setDialog({ art: "add" }); }}>
          {t.emailAdd}
        </Button>
      </div>
      )}

      {dialog && dialog.art !== "remove" && (
        <Modal label={dialog.art === "add" ? t.emailAddTitle : t.emailChangeTitle} onCancel={zu} error={fehler?.text}>
          <h2 className="ct-h3">{dialog.art === "add" ? t.emailAddTitle : t.emailChangeTitle}</h2>
          <p className="ct-small mt-1 text-muted">{dialog.art === "add" ? t.emailAddBody : t.emailChangeBody}</p>
          <div className="mt-4">
            <Field label={t.emailAddress} htmlFor="pe-adresse">
              <Input id="pe-adresse" type="email" autoComplete="off" value={adresse} onChange={(e) => setAdresse(e.target.value)} />
            </Field>
          </div>
          {besitzerLink}
          <ModalFuss className="justify-end">
            <Button variant="ghost" disabled={pending} onClick={zu}>
              {common.cancel}
            </Button>
            <Button
              disabled={pending || adresse.trim() === ""}
              onClick={() => ausfuehren(dialog.art, dialog.art === "change" ? dialog.mail : null, adresse, dialog.art === "add" ? t.emailAdded : t.emailChanged)}
            >
              {common.save}
            </Button>
          </ModalFuss>
        </Modal>
      )}
      {dialog?.art === "remove" && (
        <Modal label={t.emailRemoveTitle} onCancel={zu} error={fehler?.text}>
          <h2 className="ct-h3">{t.emailRemoveTitle}</h2>
          <p className="ct-small mt-1 text-muted">{t.emailRemoveBody.replace("{email}", dialog.mail.email)}</p>
          <ModalFuss className="justify-end">
            <Button variant="ghost" disabled={pending} onClick={zu}>
              {common.cancel}
            </Button>
            <Button disabled={pending} onClick={() => ausfuehren("remove", dialog.mail, null, t.emailRemoved)}>
              {t.emailRemove}
            </Button>
          </ModalFuss>
        </Modal>
      )}
    </>
  );
}
