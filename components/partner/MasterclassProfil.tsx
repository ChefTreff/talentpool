"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useUngesichert, type UngesichertTexte } from "@/components/ui/useUngesichert";
import { HiringUebernehmen, type HiringVorbelegung } from "./HiringUebernehmen";
import { detailsMitProfil, profilAusDetails, profilGleich, profilMitEintrag } from "./hiring-uebernehmen";
import { ProfilAuswahl, profilUmschalten, type ProfilFeld, type ProfilOption, type Zielprofil } from "./ProfilAuswahl";

type Strings = Record<string, string>;

/**
 * Das Wunschprofil einer Masterclass (K-94 Stufe 2b, PART-140): dieselben fünf Fragen wie beim Stopp der Company Tour und bei den Interview Tables (`ProfilAuswahl`), darüber
 * „Aus ‚Wen sucht ihr?‘ übernehmen“ (Vorbelegung statt Verweis). Seit Stufe 1 (0306) trägt die Masterclass `target_profile` in `format_details`; hier steht die Maske dazu.
 *
 * Dieselbe Maske im Partner-Portal und im Admin unter der Organisation — der Unterschied ist nur, wer speichert (`save`: `updateFormatDetails` bzw. `adminUpdateFormatDetails`,
 * beide über `partner_update_session`). **`format_details` wird als Ganzes geschrieben** (Goodies, Bild, Texte bleiben dabei: `detailsMitProfil`); ein leeres Profil nimmt den
 * Schlüssel heraus. Das Profil ändert weder Titel noch Beschreibung, schickt die Masterclass also nicht zurück in die Freigabe.
 *
 * Gespeichert wird mit „Speichern“, nicht beim Klick: das Profil besteht aus fünf Fragen, und „Übernehmen“ füllt mehrere auf einmal vor.
 */
export function MasterclassProfil({
  details,
  felder,
  vorbelegung,
  canEdit,
  save,
  kopf = true,
  profilT,
  t,
  rpcMessages,
  unsaved,
}: {
  details: Record<string, unknown> | null;
  felder: Record<ProfilFeld, ProfilOption[]>;
  vorbelegung: HiringVorbelegung;
  canEdit: boolean;
  save: (details: Record<string, unknown>) => Promise<{ ok: boolean; key?: string; detail?: string }>;
  /** `false`, wo die Karte Titel und Hinweis des Wunschprofils schon trägt (Partner-Portal). */
  kopf?: boolean;
  /** Die Texte von `ProfilAuswahl` (`profileTitle`, `profileHint`, `profileOpen`, `profile_<feld>`) — dieselben wie bei Tour und Interview Tables. */
  profilT: Strings;
  /** `save`, `saved`, `noRights`. */
  t: Strings;
  rpcMessages: Record<string, string>;
  /** Rückfrage vor dem Verlassen mit ungesicherten Änderungen (QS-051), Texte aus `common.unsaved` der Seite. */
  unsaved: UngesichertTexte;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSaving] = useTransition();
  const [basis, setBasis] = useState<Zielprofil>(() => profilAusDetails(details));
  const [profil, setProfil] = useState<Zielprofil>(() => profilAusDetails(details));
  const [fehler, setFehler] = useState<string | null>(null);
  const geaendert = !profilGleich(profil, basis);
  // Wer auswählt und wegklickt, wird gefragt (QS-051) — nur, wo bearbeitet werden darf.
  const warnung = useUngesichert(canEdit && geaendert, unsaved);

  function speichern() {
    if (!geaendert) return;
    setFehler(null);
    startSaving(async () => {
      const res = await save(detailsMitProfil(details, profil));
      if (!res.ok) {
        const text = rpcMessages[res.key ?? "unknown"] ?? rpcMessages.unknown ?? res.key ?? "";
        setFehler(res.detail ? `${text} (${res.detail})` : text);
        return;
      }
      setBasis(profil);
      toast("success", t.saved);
      router.refresh();
    });
  }

  return (
    <form
      className="flex max-w-detail flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        speichern();
      }}
    >
      <ProfilAuswahl
        felder={felder}
        value={profil}
        onToggle={(feld, key) => setProfil((p) => profilUmschalten(p, feld, key))}
        disabled={!canEdit}
        kopf={kopf}
        t={profilT}
        vorbelegung={
          canEdit ? <HiringUebernehmen vorbelegung={vorbelegung} felder={felder} onUebernehmen={(e) => setProfil((p) => profilMitEintrag(p, e))} /> : undefined
        }
      />
      {fehler && (
        <p role="alert" className="ct-small text-error-ink">
          {fehler}
        </p>
      )}
      {canEdit ? (
        <div>
          <Button type="submit" loading={saving} disabled={!geaendert}>
            {t.save}
          </Button>
        </div>
      ) : (
        <p className="ct-help">{t.noRights}</p>
      )}
      {warnung}
    </form>
  );
}
