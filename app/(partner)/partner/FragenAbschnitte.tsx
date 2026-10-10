import { Badge } from "@/components/ui/Badge";
import { EigeneFrageAntrag } from "@/components/partner/EigeneFrageAntrag";
import { FragenAuswahl } from "@/components/partner/FragenAuswahl";
import { MAX_EIGENE_FRAGEN, fragenAufteilen, type SessionFrage } from "@/components/partner/fragen";

/**
 * Die drei Abschnitte der Bewerbungsfragen eines Gesprächs (PART-045): was das Team gesetzt hat (nur lesen), Katalogfragen, die Partner wählen dürfen, und
 * bis zu zwei eigene Fragen. Aus `FormatFragen` herausgelöst (PART-150), weil dieselben Abschnitte jetzt an drei Stellen stehen: je Gespräch (Masterclass,
 * Side-Event), im Schubfach „Fragen ändern“ eines Tisch-Gesprächs und — die Katalogwahl dort mit eigener Karte — in der Tischvorgabe (`TischFragen`).
 */

const text = (f: SessionFrage, locale: string) => (locale === "en" ? f.label_en : f.label_de);

/** Was das Team gesetzt hat — nur lesen; ohne Fragen des Teams steht nichts da. */
export function TeamFragen({ team, locale, s }: { team: SessionFrage[]; locale: string; s: Record<string, string> }) {
  if (team.length === 0) return null;
  return (
    <section aria-label={s.teamQuestionsTitle}>
      <h3 className="ct-label text-ink">{s.teamQuestionsTitle}</h3>
      <p className="ct-help mt-1">{s.teamQuestionsHint}</p>
      <ul className="mt-2 flex flex-col gap-1">
        {team.map((f) => (
          <li key={f.id} className="ct-small flex flex-wrap items-center gap-2 text-ink">
            {text(f, locale)}
            {f.required && <Badge>{s.required}</Badge>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Die wählbaren Katalogfragen eines Gesprächs mit eigenem Speichern (`FragenAuswahl`). */
export function KatalogFragen({
  sessionId,
  waehlbar,
  gewaehlt,
  canEdit,
  s,
  rpc,
}: {
  sessionId: string;
  waehlbar: { id: string; label: string }[];
  gewaehlt: string[];
  canEdit: boolean;
  s: Record<string, string>;
  rpc: Record<string, string>;
}) {
  return (
    <section aria-label={s.catalogTitle}>
      <h3 className="ct-label text-ink">{s.catalogTitle}</h3>
      {waehlbar.length === 0 ? (
        <p className="ct-help mt-1">{s.catalogEmpty}</p>
      ) : (
        <div className="mt-2">
          <FragenAuswahl sessionId={sessionId} waehlbar={waehlbar} gewaehlt={gewaehlt} canEdit={canEdit} t={s} rpcMessages={rpc} />
        </div>
      )}
    </section>
  );
}

/** Die eigenen Fragen eines Gesprächs mit dem Antrag für eine weitere (höchstens zwei, Freigabe durch das Programm-Team). */
export function EigeneFragen({
  sessionId,
  eigene,
  canEdit,
  locale,
  s,
  rpc,
  cancel,
}: {
  sessionId: string;
  eigene: SessionFrage[];
  canEdit: boolean;
  locale: string;
  s: Record<string, string>;
  rpc: Record<string, string>;
  cancel: string;
}) {
  return (
    <section aria-label={s.ownTitle}>
      <h3 className="ct-label text-ink">{s.ownTitle}</h3>
      <p className="ct-help mt-1">{s.ownHint.replace("{max}", String(MAX_EIGENE_FRAGEN))}</p>
      {eigene.length > 0 && (
        <ul className="mt-2 flex flex-col gap-2">
          {eigene.map((f) => (
            <li key={f.id} className="flex flex-col gap-0.5">
              <span className="ct-small flex flex-wrap items-center gap-2 text-ink">
                {text(f, locale)}
                <Badge tone={f.approved_at ? "success" : "warning"}>{f.approved_at ? s.ownApproved : s.ownPending}</Badge>
              </span>
              {f.purpose && <span className="ct-help">{s.ownPurposeShown.replace("{zweck}", f.purpose)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        {eigene.length >= MAX_EIGENE_FRAGEN ? (
          <p className="ct-help">{s.ownMaxReached}</p>
        ) : canEdit ? (
          <EigeneFrageAntrag sessionId={sessionId} t={{ ...s, cancel }} rpcMessages={rpc} />
        ) : null}
      </div>
    </section>
  );
}

/** Alle drei Abschnitte eines Gesprächs untereinander — wie sie `FormatFragen` je Gespräch zeigt und das Schubfach „Fragen ändern“. */
export function FragenAbschnitte({
  sessionId,
  fragen,
  waehlbar,
  canEdit,
  locale,
  s,
  rpc,
  cancel,
}: {
  sessionId: string;
  fragen: SessionFrage[];
  waehlbar: { id: string; label: string }[];
  canEdit: boolean;
  locale: string;
  s: Record<string, string>;
  rpc: Record<string, string>;
  cancel: string;
}) {
  const { team, gewaehlt, eigene } = fragenAufteilen(fragen, new Set(waehlbar.map((q) => q.id)));
  return (
    <div className="flex flex-col gap-6">
      <TeamFragen team={team} locale={locale} s={s} />
      <KatalogFragen sessionId={sessionId} waehlbar={waehlbar} gewaehlt={gewaehlt} canEdit={canEdit} s={s} rpc={rpc} />
      <EigeneFragen sessionId={sessionId} eigene={eigene} canEdit={canEdit} locale={locale} s={s} rpc={rpc} cancel={cancel} />
    </div>
  );
}
