/**
 * Der Satz unter der Speaker-Liste (PART-136, PART-149): was für **alle** Speaker einer Session gilt, steht einmal unter der Tabelle und nicht
 * bei jedem Namen — wer sich selbst pflegt (eigener Zugang, die Angaben gehören ihm) und wer über den Operations-Kontakt läuft (dann kommt keine Mail
 * vom Speaker, sondern von dort). Auf der Talk-Seite und auf der Masterclass-Seite derselbe Satz aus derselben Regel.
 *
 * `null`, wenn es nichts zu sagen gibt: nur Speaker, die der Partner selbst pflegt.
 */
export function speakerNotiz(
  speakers: readonly { can_edit: boolean; mail_contact_name: string | null }[],
  t: { speakersNoteOwn: string; speakersNoteManaged: string },
): string | null {
  const kontakt = speakers.find((sp) => sp.mail_contact_name)?.mail_contact_name ?? null;
  const pflegtSelbst = speakers.some((sp) => !sp.can_edit && !sp.mail_contact_name);
  const text = [pflegtSelbst ? t.speakersNoteOwn : null, kontakt ? t.speakersNoteManaged.replace(/\{kontakt\}/g, kontakt) : null]
    .filter(Boolean)
    .join(" ");
  return text === "" ? null : text;
}
