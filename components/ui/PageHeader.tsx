import type { ReactNode, Ref } from "react";

/**
 * Ein H1 pro Seite, linksbündig, Versalien (Design-Briefing §3).
 *
 * **Das kursive Schlüsselwort** (`word`, QS-037): Über dem Titel steht ein
 * Wort in ABC Laica Italic im Akzent — der Sektionskopf der Website
 * („Laica-Kursiv-Eyebrow → Extrabold-Versalien-Titel"), den das Portal bis
 * zum 24.09. durch eine Versalienzeile ersetzt hatte. Konrad hat die
 * Talent-Startseite zum Vorbild erklärt, gerade wegen der Kursiven und der
 * klaren Farbstufen; ohne das Wort war jede Unterseite eine schwarze
 * Überschrift auf grauem Grund.
 *
 * Das Wort ist derselbe Begriff wie auf der Einstiegskarte der Startseite,
 * die hierher führt („Bühne" → Deine Session). So erkennt man die Seite
 * wieder, bevor man den Titel gelesen hat. Es ist der **eine** Laica-Moment
 * des Screens; eine zweite Kursive auf derselben Seite nimmt ihm die Wirkung.
 *
 * **Der Titel kann sich ändern, ohne dass die Seite wechselt** (PART-104, Wiki):
 * dort ist der gelesene Artikel der Seitentitel. `titleId` und `titleRef` machen
 * ihn zum Ziel des Fokus — der Titel wird beim Wechsel angesprungen und trägt
 * dafür `tabIndex={-1}`, ohne ein Tabulator-Halt zu sein.
 */
export function PageHeader({
  eyebrow,
  word,
  title,
  description,
  actions,
  titleId,
  titleRef,
  titleLang,
}: {
  /** Kleine Zeile über dem Titel — Text oder, bei Unterseiten, ein Rücklink. */
  eyebrow?: ReactNode;
  /** Ein Wort, kein Halbsatz. Kursiv im Akzent, über dem Titel. */
  word?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Kennung des Titels, wenn etwas auf ihn zeigt (`aria-labelledby`). */
  titleId?: string;
  /** Für Seiten, die den Fokus auf den Titel setzen, wenn er wechselt. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** Sprache des Titels, wenn sie von der der Seite abweicht (ein Wiki-Artikel nur in der anderen Sprache). */
  titleLang?: string;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-text">
        {eyebrow && <p className="ct-eyebrow mb-1 text-muted">{eyebrow}</p>}
        {word && <p className="ct-laica text-accent-strong">{word}</p>}
        <h1 id={titleId} ref={titleRef} lang={titleLang} tabIndex={titleRef ? -1 : undefined} className="ct-h1 text-ink">
          {title}
        </h1>
        {description && <p className="mt-2 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
