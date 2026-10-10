import Link from "next/link";
import type { Locale } from "@/lib/i18n/shared";
import { speakerNotiz } from "@/lib/partner/speaker-notiz";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { vomTeamEingetragen, type BuehnenSession } from "@/components/partner/eure-buehne";
import { fehlendFuerFreigabe, partnerStatus, type FehlendesFeld } from "@/components/partner/standbuehne";
import { RueckgabeHinweis, SessionStatusBadge, rueckgabeOffen, type RueckgabeTexte } from "../../Rueckgabe";
import { zeitraum } from "../../company-tour/daten";
import { SpeakerHinzufuegen } from "../../talk/SpeakerHinzufuegen";
import { SpeakerTabelle } from "../../talk/SpeakerTabelle";
import type { PartnerFormatSession, PartnerSpeaker } from "../../talk/types";
import { VeroeffentlichenKnopf } from "./VeroeffentlichenKnopf";

type Strings = Record<string, string>;

/**
 * **Ein** Programmpunkt der gebrandeten Bühne mit allem, was der Partner dort tut (PART-138): Titel, Format, Stand, Termin, „Wer spricht“ — und seit PART-148 c die Veröffentlichung. Dieselbe
 * Karte wie auf der Talk-Seite (PART-136/149, Skill-Regel 13), dazu der Weg der Standbühne: „Veröffentlichen“ ist die **Anfrage** an die Programmleitung (`partner_request_publish`, jetzt auch für
 * die gebrandete Bühne), eine Rückgabe mit Grund steht in der Karte (`RueckgabeHinweis`, PART-083), und was für die Anfrage noch fehlt, nennt die Karte mit dem Weg in den Kalender, wo Titel
 * und Beschreibung gepflegt werden. Stand, Rückgabe und Pflichtfelder kommen aus `partner_format_sessions` (`detail`) — seit 0315 steht dort auch die Session ohne Organisation auf der gebrandeten Bühne;
 * ohne diese Zeile (eine Session einer anderen Organisation auf eurer Bühne) gibt es keinen Knopf.
 *
 * „Speaker eintragen“ steht in der Kopfzeile des Blocks, sobald es eine Liste gibt; vorher trägt der Leerzustand die eine Aktion. Wer das Team schon eingetragen hat, steht als Zeile
 * ohne Knopf darunter — sonst läse der Partner „Noch niemand eingetragen“ über einem Programmpunkt, auf dem längst jemand steht, und trüge die Person doppelt ein.
 */
export function SessionKarte({
  x,
  detail,
  eigeneSpeaker,
  canEdit,
  opsName,
  locale,
  dateLocale,
  formatLabel,
  statusLabel,
  rueckgabe,
  mitBuehne,
  s,
  stage,
  rpcMessages,
  kalenderHref,
}: {
  x: BuehnenSession;
  /** Die Zeile des Programmpunkts aus `partner_format_sessions` (Stand, Rückgabe, Pflichtfelder); `null`, wenn sie für diese Organisation dort nicht steht. */
  detail: PartnerFormatSession | null;
  /** Die Speaker dieses Programmpunkts, die der Partner selbst eingetragen hat (`partner_speakers`). */
  eigeneSpeaker: PartnerSpeaker[];
  canEdit: boolean;
  /** Name des Operations-Kontakts, `null` ohne einen. */
  opsName: string | null;
  locale: Locale;
  dateLocale: string;
  formatLabel: Record<string, string>;
  statusLabel: Record<string, string>;
  rueckgabe: RueckgabeTexte;
  /** Mit mehr als einer gebrandeten Bühne steht der Name der Bühne in der Zeile. */
  mitBuehne: boolean;
  /** Texte der Speaker-Liste (`partnerTalk`) — dieselben wie auf der Talk-Seite. */
  s: Strings;
  /** Texte der Seite (`partnerStage`). */
  stage: Strings;
  rpcMessages: Record<string, string>;
  /** Wohin „Im Kalender ergänzen“ führt: der Kalender der Bühne, dort pflegt der Partner Titel und Beschreibung. */
  kalenderHref: string;
}) {
  const team = vomTeamEingetragen(x.speakers, new Set(eigeneSpeaker.map((sp) => sp.person_id)));
  const anzahl = eigeneSpeaker.length + team.length;
  // Was für alle Speaker gilt, steht einmal unter der Tabelle statt bei jedem Namen (PART-136).
  const notiz = speakerNotiz(eigeneSpeaker, { speakersNoteOwn: s.speakersNoteOwn, speakersNoteManaged: s.speakersNoteManaged });
  const titel = (locale === "en" ? x.titleEn : x.titleDe) ?? x.titleDe ?? stage.noTitle;
  // Stand aus Sicht des Partners: ein offener Rückgabegrund macht aus „In Bearbeitung“ „Zurückgegeben“ (PART-083). Ohne die Zeile aus `partner_format_sessions` gilt der Stand des Programms.
  const rueckgabeZeile = detail && rueckgabeOffen(detail) ? detail : null;
  const status = detail?.publish_status ?? x.publishStatus ?? "draft";
  const stand = partnerStatus({ sessionId: x.sessionId, publishStatus: status, returnNote: rueckgabeZeile?.return_note });
  // Was für die Anfrage fehlt, wie in `partner_request_publish`; nur dort gefragt, wo sie möglich ist.
  const fehlt: FehlendesFeld[] =
    canEdit && detail && (stand === "in_bearbeitung" || stand === "zurueckgegeben") ? fehlendFuerFreigabe(detail) : [];
  const feldName: Record<FehlendesFeld, string> = { title_de: stage.fieldTitleDe, title_en: stage.fieldTitleEn, description: stage.fieldDescription };
  const hinweisId = `veroeffentlichen-hinweis-${x.sessionId}`;
  const eintragen = canEdit ? <SpeakerHinzufuegen sessionId={x.sessionId} opsName={opsName} t={s} rpcMessages={rpcMessages} /> : null;
  const vomTeam = team.length > 0 ? <p className="ct-help">{stage.speakersByTeam.replace("{namen}", team.join(", "))}</p> : null;

  return (
    <Card>
      <CardHeader
        ebene="h2"
        title={titel}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge>{formatLabel[x.format] ?? x.format}</Badge>
            <SessionStatusBadge publishStatus={status} returnNote={rueckgabeZeile?.return_note ?? null} statusLabel={statusLabel} t={rueckgabe} />
            {canEdit && detail && (
              <VeroeffentlichenKnopf sessionId={x.sessionId} stand={stand} gesperrt={fehlt.length > 0} hinweisId={hinweisId} t={stage} rpcMessages={rpcMessages} />
            )}
          </div>
        }
      />
      {/* Der Slot wie auf der Talk-Seite: Termin und Bühne in einer Zeile. */}
      <dl className="ct-small flex flex-wrap gap-x-8 gap-y-1">
        <div className="flex gap-2">
          <dt className="ct-label text-muted">{s.slotLabel}</dt>
          <dd className="tabular-nums text-ink">{zeitraum(x.startAt, x.endAt, dateLocale) ?? s.slotPending}</dd>
        </div>
        {mitBuehne && (
          <div className="flex gap-2">
            <dt className="ct-label text-muted">{s.stageLabel}</dt>
            <dd className="text-ink">{x.stageName}</dd>
          </div>
        )}
      </dl>

      {rueckgabeZeile && (
        <RueckgabeHinweis note={rueckgabeZeile.return_note} returnedAt={rueckgabeZeile.returned_at} dateLocale={dateLocale} t={rueckgabe} className="mt-4" />
      )}
      {fehlt.length > 0 && (
        <p id={hinweisId} className="ct-help mt-4">
          {stage.missingFields.replace("{fields}", fehlt.map((f) => feldName[f]).join(", "))}{" "}
          <Link href={kalenderHref} className="ct-link">
            {stage.speakersToCalendar}
          </Link>
        </p>
      )}

      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className="ct-h3 text-ink">{anzahl > 0 ? `${s.speakersLabel} (${anzahl})` : s.speakersLabel}</h3>
          {eigeneSpeaker.length > 0 && eintragen}
        </div>
        {eigeneSpeaker.length > 0 ? (
          <>
            <SpeakerTabelle speakers={eigeneSpeaker} canEdit={canEdit} t={s} rpcMessages={rpcMessages} />
            {notiz && <p className="ct-help">{notiz}</p>}
            {vomTeam}
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            {vomTeam ?? <p className="ct-help">{s.noSpeakerYet}</p>}
            {eintragen}
          </div>
        )}
      </div>
    </Card>
  );
}
