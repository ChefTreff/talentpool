import Link from "next/link";
import type { Dictionary } from "@/lib/i18n";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, StatCard } from "@/components/ui/Card";
import { HeroBand, BandStat } from "@/components/ui/HeroBand";
import { PhotoCard } from "@/components/ui/PhotoCard";
import type { ManagedSpeaker } from "./types";
import type { Uebersicht } from "./uebersicht";

/** Wie viele Zeilen die beiden Listen zeigen — der Rest steht eine Seite weiter. */
const ZEILEN = 5;

/**
 * Die Übersicht des Stage-Lead-Portals (LEAD-024) als Darstellung. Aufbau nach
 * dem Talent-Muster (QS-037): Band mit Gruss und **einer** Aktion, drei
 * Einstiege, dann die Arbeit — Kurzüberblick, Aufgaben, „Fehlt noch“.
 */
export function UebersichtAnsicht({
  t,
  vorname,
  buehnen,
  u,
}: {
  t: Dictionary;
  vorname: string | null;
  /** Namen der eigenen Bühnen (Stage-Scope); leer für Team und globale Leads. */
  buehnen: string[];
  u: Uebersicht;
}) {
  const tl = t.leads;
  const tv = t.speakerVerlauf;
  const portal = t.areas["speaker-leads"].portal;
  const name = (s: ManagedSpeaker) => [s.first_name, s.last_name].filter(Boolean).join(" ") || "—";
  const datum = new Intl.DateTimeFormat(t.meta.dateLocale, { day: "numeric", month: "short" });
  const eyebrow =
    buehnen.length === 1
      ? `${portal} · ${buehnen[0]}`
      : buehnen.length > 1
        ? `${portal} · ${tl.overviewStages.replace("{n}", String(buehnen.length))}`
        : portal;

  // Genau eine Aktion: der nächste offene Schritt (Talent-Muster). Fällige
  // Aufgaben zuerst, dann offene Schritte bestätigter Speaker, sonst der Kern.
  const aktion =
    u.faellig > 0 ? (
      <ButtonLink href="/speaker-leads/pipeline">{tl.bandActionDue.replace("{n}", String(u.faellig))}</ButtonLink>
    ) : u.fehltNoch.length > 0 ? (
      <ButtonLink href="/speaker-leads/bestaetigt">{tl.bandActionMissing}</ButtonLink>
    ) : (
      <ButtonLink href="/speaker-leads/pipeline">{tl.bandActionPipeline}</ButtonLink>
    );

  const kacheln = [
    { label: tl.statOutreach, value: String(u.ansprache), href: "/speaker-leads/pipeline" },
    { label: tl.statConfirmed, value: String(u.bestaetigt), href: "/speaker-leads/bestaetigt" },
    { label: tl.statTasks, value: String(u.offeneAufgaben), href: "/speaker-leads/pipeline" },
    ...(u.slots.gesamt > 0
      ? [{ label: tl.statSlots, value: `${u.slots.belegt} / ${u.slots.gesamt}`, href: "/speaker-leads/board" }]
      : []),
  ];

  return (
    <>
      <HeroBand
        eyebrow={eyebrow}
        title={vorname ? tl.bandGreeting.replace("{name}", vorname) : portal}
        highlight={vorname ? tl.bandHighlight : undefined}
        lead={tl.overviewLead}
        action={aktion}
        aside={
          <BandStat
            value={String(u.bestaetigt)}
            label={tl.bandStatLabel}
            hint={tl.bandStatHint.replace("{n}", String(u.ansprache))}
          />
        }
      />

      {/* Die drei Einstiege (QS-037): Akquise, Onboarding, Programm — der Weg
          eines Speakers durch das Portal. Das Wort steht als Kopf auf der
          Seite, zu der die Karte führt. */}
      <div className="mb-10 grid gap-6 sm:grid-cols-3">
        <PhotoCard
          word={tl.wordLineup}
          title={tl.title}
          description={tl.entryPipelineBody}
          action={
            <ButtonLink href="/speaker-leads/pipeline" variant="secondary" size="sm">
              {tl.entryOpen.replace("{title}", tl.navPipeline)}
            </ButtonLink>
          }
        />
        <PhotoCard
          word={tl.wordOnboarding}
          title={tl.confirmedTitle}
          description={tl.entryConfirmedBody}
          action={
            <ButtonLink href="/speaker-leads/bestaetigt" variant="secondary" size="sm">
              {tl.entryOpen.replace("{title}", tl.navConfirmed)}
            </ButtonLink>
          }
        />
        <PhotoCard
          word={tl.wordProgramme}
          title={tl.boardTitle}
          description={tl.entryBoardBody}
          action={
            <ButtonLink href="/speaker-leads/board" variant="secondary" size="sm">
              {tl.entryOpen.replace("{title}", tl.navBoard)}
            </ButtonLink>
          }
        />
      </div>

      {/* Kurzüberblick: die Zahlen, die eine Stage-Leitung zuerst braucht —
          jede führt zu der Liste, aus der sie stammt. */}
      <section aria-labelledby="leads-ueberblick" className="mb-10">
        <h2 id="leads-ueberblick" className="ct-h2 mb-4 text-ink">
          {tl.overviewStatsTitle}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kacheln.map((k) => (
            <Link key={k.label} href={k.href} className="rounded-ct-lg transition-colors hover:bg-surface-hover">
              <StatCard label={k.label} value={k.value} />
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Als Nächstes: die eigenen Aufgaben mit Frist (LEAD-027), früheste
            zuerst — dieselbe Regel wie „Fällig“ oben in der Pipeline. */}
        <Card as="section">
          <h2 className="ct-h2 text-ink">{tl.nextTitle}</h2>
          <p className="ct-help mb-4 mt-1">{tl.nextHint}</p>
          {u.meineAufgaben.length === 0 ? (
            <p className="ct-small text-muted">{tl.nextEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {u.meineAufgaben.slice(0, ZEILEN).map(({ speaker, stand }) => (
                <li key={speaker.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  {stand === "ueberfaellig" ? (
                    <Badge tone="error">{tv.overdue}</Badge>
                  ) : stand === "heute" ? (
                    <Badge tone="warning">{tv.dueToday}</Badge>
                  ) : (
                    <Badge>{datum.format(new Date(`${speaker.next_task!.due_on}T12:00:00`))}</Badge>
                  )}
                  <span className="ct-label text-ink">{name(speaker)}</span>
                  <span className="ct-small min-w-0 basis-full text-ink sm:basis-auto">{speaker.next_task!.body}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <ButtonLink href="/speaker-leads/pipeline" variant="ghost" size="sm">
              {tl.nextAll}
            </ButtonLink>
          </div>
        </Card>

        {/* Fehlt noch: bestätigte Speaker mit offenen Schritten — dieselben
            Wörter wie in der Spalte „Fehlt noch“ der Bestätigten. */}
        <Card as="section">
          <h2 className="ct-h2 text-ink">{tl.missingTitle}</h2>
          <p className="ct-help mb-4 mt-1">{tl.missingHint}</p>
          {u.fehltNoch.length === 0 ? (
            <p className="ct-small text-muted">{u.bestaetigt > 0 ? tl.missingNone : tl.missingNoConfirmed}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {u.fehltNoch.slice(0, ZEILEN).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <span className="ct-label text-ink">{name(s)}</span>
                  <span className="flex flex-wrap gap-1">
                    {(s.next_open ?? []).map((step) => (
                      <Badge key={step}>{(tl as Record<string, string>)[`step_${step}`] ?? step}</Badge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <ButtonLink href="/speaker-leads/bestaetigt" variant="ghost" size="sm">
              {u.fehltNoch.length > ZEILEN ? tl.missingAllN.replace("{n}", String(u.fehltNoch.length)) : tl.missingAll}
            </ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
