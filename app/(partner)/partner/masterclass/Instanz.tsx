import type { Locale } from "@/lib/i18n/shared";
import { Card, CardHeader } from "@/components/ui/Card";
import type { UngesichertTexte } from "@/components/ui/useUngesichert";
import { GoodiesFrage } from "@/components/partner/GoodiesFrage";
import type { HiringVorbelegung } from "@/components/partner/HiringUebernehmen";
import { MasterclassProfil } from "@/components/partner/MasterclassProfil";
import type { ProfilFeld, ProfilOption } from "@/components/partner/profil";
import { speakerNotiz } from "@/lib/partner/speaker-notiz";
import { updateFormatDetails } from "../actions";
import { RueckgabeHinweis, SessionStatusBadge, rueckgabeOffen, type RueckgabeTexte } from "../Rueckgabe";
import { SpeakerHinzufuegen } from "../talk/SpeakerHinzufuegen";
import { SpeakerTabelle } from "../talk/SpeakerTabelle";
import type { PartnerFormatSession, PartnerSpeaker } from "../talk/types";
import { zeitraum } from "../company-tour/daten";
import { MasterclassInhalt } from "./MasterclassInhalt";

/** Versandadresse und Fristen für vorab geschickte Pakete (Wiki-Artikel `anlieferung-aufbau`). */
const WIKI_ANLIEFERUNG = "/partner/wiki#anlieferung-aufbau";

type Strings = Record<string, string>;

/**
 * **Eine** Masterclass mit allem, was zu ihr gehört (PART-045, QS-079): Kopfkarte (Titel, Stand, Slot, Raum, Rückgabe der Programmleitung),
 * Inhalt, Wunschprofil, Goodies und „Wer spricht“. Die Seite zeichnet nur die gewählte — bei mehreren Masterclasses wählt der Umschalter darüber
 * (`?instanz=`), und die Seite setzt `key={gewaehlt.id}`: ein Wechsel setzt jedes Formular zurück, der Entwurf der einen Masterclass
 * bleibt nicht im Feld der anderen stehen.
 *
 * Überschriften: der Seitentitel `h1`, die Masterclass `h2`, ihre Abschnitte `h3`.
 *
 * **„Wer spricht“ (PART-149, Konrad 09.10.2026, Skill-Regel 13):** „Speaker eintragen“ steht in der Kopfzeile des Blocks, rechts neben dem
 * Titel, sobald es eine Liste gibt — vorher trägt der Leerzustand die eine Aktion. „Angaben pflegen“ steht je Speaker in seiner Zeile, rechts.
 * Beides öffnet im Schubfach; nirgends mehr ein Knopf unter der Liste. Was für alle Speaker gilt, steht einmal unter der Tabelle.
 */
export function Instanz({
  x,
  speakers,
  canEdit,
  opsName,
  locale,
  dateLocale,
  sprachen,
  profilFelder,
  hiring,
  profilT,
  statusLabel,
  rueckgabe,
  s,
  talk,
  unsaved,
  rpcMessages,
}: {
  x: PartnerFormatSession;
  /** Nur die Speaker dieser Masterclass. */
  speakers: PartnerSpeaker[];
  canEdit: boolean;
  /** Name des Operations-Kontakts, `null` ohne einen. */
  opsName: string | null;
  locale: Locale;
  dateLocale: string;
  sprachen: { value: string; label: string }[];
  /** K-94 Stufe 2b: die Auswahllisten des Wunschprofils, die Einträge von „Wen sucht ihr?“ und die Texte der Fragen (dieselben wie bei der Company Tour). */
  profilFelder: Record<ProfilFeld, ProfilOption[]>;
  hiring: HiringVorbelegung;
  profilT: Strings;
  statusLabel: Record<string, string>;
  rueckgabe: RueckgabeTexte;
  /** Texte der Masterclass (`partnerMasterclass`). */
  s: Strings;
  /** Texte der Speaker-Liste (`partnerTalk`) — dieselben wie auf der Talk-Seite. */
  talk: Strings;
  unsaved: UngesichertTexte;
  rpcMessages: Record<string, string>;
}) {
  const titel = (locale === "en" ? x.title_en : x.title_de) ?? x.title_de ?? s.untitled;
  const notiz = speakerNotiz(speakers, { speakersNoteOwn: talk.speakersNoteOwn, speakersNoteManaged: talk.speakersNoteManaged });
  const eintragen = canEdit ? <SpeakerHinzufuegen sessionId={x.id} opsName={opsName} t={talk} rpcMessages={rpcMessages} /> : null;

  return (
    <section aria-label={titel} className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="ct-h3 text-ink">{titel}</h2>
          <SessionStatusBadge publishStatus={x.publish_status} returnNote={x.return_note} statusLabel={statusLabel} t={rueckgabe} />
        </div>
        <dl className="ct-small mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="ct-label text-muted">{s.slotLabel}</dt>
            <dd className="tabular-nums text-ink">{zeitraum(x.starts_at, x.ends_at, dateLocale) ?? s.slotPending}</dd>
          </div>
          <div>
            <dt className="ct-label text-muted">{s.roomLabel}</dt>
            <dd className="text-ink">{x.stage_name ?? s.roomPending}</dd>
          </div>
        </dl>
        {rueckgabeOffen(x) && <RueckgabeHinweis className="mt-4" note={x.return_note} returnedAt={x.returned_at} dateLocale={dateLocale} t={rueckgabe} />}
      </Card>

      <Card>
        <CardHeader ebene="h3" title={s.contentTitle} description={s.contentLead} />
        <MasterclassInhalt session={x} sprachen={sprachen} canEdit={canEdit} t={s} rpcMessages={rpcMessages} unsaved={unsaved} />
      </Card>

      <Card>
        {/* K-94 Stufe 2b (PART-140): Titel und Hinweis trägt die Karte, die Fragen darunter lassen den eigenen Kopf weg. */}
        <CardHeader ebene="h3" title={profilT.profileTitle} description={profilT.profileHint} />
        <MasterclassProfil
          details={x.format_details}
          felder={profilFelder}
          vorbelegung={hiring}
          canEdit={canEdit}
          save={updateFormatDetails.bind(null, x.id)}
          kopf={false}
          profilT={profilT}
          t={s}
          rpcMessages={rpcMessages}
          unsaved={unsaved}
        />
      </Card>

      <Card>
        <CardHeader ebene="h3" title={s.goodiesTitle} description={s.goodiesLead} />
        <GoodiesFrage
          sessionId={x.id}
          details={x.format_details}
          canEdit={canEdit}
          save={updateFormatDetails.bind(null, x.id)}
          wikiHref={WIKI_ANLIEFERUNG}
          t={{
            question: s.goodiesQuestion,
            yes: s.goodiesYes,
            no: s.goodiesNo,
            none: s.goodiesNone,
            hintYes: s.goodiesHintYes,
            wiki: s.goodiesWiki,
            saved: s.goodiesSaved,
          }}
          rpcMessages={rpcMessages}
        />
      </Card>

      <Card>
        <CardHeader ebene="h3" title={talk.speakersLabel} description={s.speakersLead} action={speakers.length > 0 ? eintragen : undefined} />
        {speakers.length > 0 ? (
          <div className="flex flex-col gap-4">
            <SpeakerTabelle speakers={speakers} canEdit={canEdit} t={talk} rpcMessages={rpcMessages} />
            {notiz && <p className="ct-help">{notiz}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="ct-help">{talk.noSpeakerYet}</p>
            {eintragen}
          </div>
        )}
      </Card>
    </section>
  );
}
