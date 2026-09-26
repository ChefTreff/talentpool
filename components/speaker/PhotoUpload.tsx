"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { FileButton } from "@/components/ui/FileButton";
import { useToast } from "@/components/ui/Toast";
import { MAX_PHOTO_BYTES, PHOTO_MIME, SPEAKER_BUCKET, safeFileName } from "@/app/(speaker)/speaker/types";

type Strings = Record<string, string>;

/** Die Server-Aktion, die das hochgeladene Foto einträgt — je Bereich eine, hinter dessen Tor. */
export type FotoRegistrieren = (input: {
  profileId: string;
  storagePath: string;
  filename: string;
  mime: string | null;
  sizeBytes: number | null;
}) => Promise<{ ok: boolean; key?: string; detail?: string }>;

/**
 * Das Profilfoto (SPK-004).
 *
 * Bis heute stand hier ein Satz, der auf das Speaker-Postfach verwies, während
 * die Startseite den Schritt „Foto" als offen führte und ins Leere verlinkte —
 * Bucket, Storage-Policy und `register_speaker_asset` liegen seit Welle 2
 * fertig da. Es fehlte allein dieses Formular.
 *
 * Die Datei geht **direkt** in den Bucket, nicht durch den Server: der Pfad
 * `<edition>/<profil>/photo/<uuid>-<datei>` ist vorgeschrieben, die
 * Storage-Policy prüft ihn, die RPC prüft ihn noch einmal und setzt
 * `photo_asset_id`. Erst danach steht das Bild im Profil.
 *
 * Seit LEAD-029 derselbe Baustein für Leads und Team: Storage-Policy und RPC
 * lassen `can_manage_speaker` und Admins schon zu. `ansicht="betreut"` spricht
 * nicht die Speakerin an; `variante="abschnitt"` passt ins Lead-Fenster, das
 * in Abschnitten statt Karten gegliedert ist.
 */
export function PhotoUpload({
  profileId,
  editionId,
  photoUrl,
  register,
  ansicht = "selbst",
  variante = "karte",
  onDone,
  t,
  rpcMessages,
}: {
  profileId: string;
  editionId: string;
  /** Signierte Adresse des aktuellen Fotos; `null`, solange keins hinterlegt ist. */
  photoUrl: string | null;
  register: FotoRegistrieren;
  ansicht?: "selbst" | "betreut";
  variante?: "karte" | "abschnitt";
  /** Nach dem Eintragen — das Lead-Fenster lädt damit die neue Adresse. */
  onDone?: () => void;
  t: Strings;
  rpcMessages: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  // Fehler stehen am Knopf, nicht als Toast (Verbotsliste des Skills, ADM-062).
  const [fehler, setFehler] = useState<string | null>(null);

  const message = (key: string) => rpcMessages[key] ?? rpcMessages.unknown ?? key;

  async function onFile(file: File) {
    setFehler(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setFehler(t.photoTooBig);
      return;
    }
    // `file.type` ist leer, wenn der Browser den Typ nicht kennt — dann
    // entscheidet die Endung nichts, und wir lassen es durch; die
    // Storage-Policy und die RPC prüfen ohnehin Pfad und Zugehörigkeit.
    if (file.type && !PHOTO_MIME.includes(file.type)) {
      setFehler(t.photoWrongType);
      return;
    }

    setUploading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const path = `${editionId}/${profileId}/photo/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await supabase.storage.from(SPEAKER_BUCKET).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (error) {
        setFehler(`${t.photoFailed} (${error.message})`);
        return;
      }
      startTransition(async () => {
        const res = await register({
          profileId,
          storagePath: path,
          filename: file.name,
          mime: file.type || null,
          sizeBytes: file.size,
        });
        if (!res.ok) {
          // Die Datei liegt dann verwaist im Bucket. Sie hier zu löschen wäre
          // der zweite Fehlerfall im ersten — lieber melden und aufräumen
          // lassen (dieselbe Regel wie beim Präsentations-Upload).
          setFehler(message(res.key ?? "unknown") + (res.detail ? ` (${res.detail})` : ""));
          return;
        }
        toast("success", t.photoDone);
        router.refresh();
        onDone?.();
      });
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || pending;
  const titel = ansicht === "betreut" ? t.photoTitleManaged : t.photoTitle;
  const hinweis = ansicht === "betreut" ? t.photoLeadManaged : t.photoLead;
  const Rahmen = variante === "abschnitt" ? Abschnitt : Karte;

  return (
    <Rahmen titel={titel} hinweis={hinweis}>

      <div className="flex flex-wrap items-center gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Signierte Storage-Adresse, keine feste Größe.
          <img
            src={photoUrl}
            alt={t.photoPreviewAlt}
            className="h-24 w-24 shrink-0 rounded-ct-md border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-ct-md border border-dashed bg-canvas"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-8 w-8 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="12" cy="9" r="3.5" />
              <path d="M4.5 19.5c1.6-3.2 4.2-4.8 7.5-4.8s5.9 1.6 7.5 4.8" />
            </svg>
          </span>
        )}

        <div className="flex flex-col gap-1">
          {!photoUrl && <p className="ct-help">{t.photoNone}</p>}
          <FileButton
            uploadLabel={t.commonUpload}
            changeLabel={t.commonChangeFile}
            label={busy ? t.photoUploading : photoUrl ? t.photoReplace : t.photoUpload}
            accept={PHOTO_MIME.join(",")}
            disabled={busy}
            hint={t.photoRules}
            onFile={onFile}
          />
          {fehler && (
            <p role="alert" className="ct-small text-error-ink">
              {fehler}
            </p>
          )}
        </div>
      </div>
    </Rahmen>
  );
}

/** Portal und Admin: eine Karte mit Überschrift, wie die Karten daneben. */
function Karte({ titel, hinweis, children }: { titel: string; hinweis: string; children: ReactNode }) {
  return (
    <Card id="foto">
      <h2 className="ct-h2 mb-1 text-ink">{titel}</h2>
      <p className="ct-help mb-4">{hinweis}</p>
      {children}
    </Card>
  );
}

/** Lead-Fenster: ein Abschnitt mit Linie und Label wie „Pipeline“ darüber. */
function Abschnitt({ titel, hinweis, children }: { titel: string; hinweis: string; children: ReactNode }) {
  return (
    <section className="border-t pt-4">
      <h3 className="ct-label mb-1 text-ink">{titel}</h3>
      <p className="ct-help mb-3">{hinweis}</p>
      {children}
    </section>
  );
}
