create or replace function export_privacy_notice(p_language text DEFAULT 'de'::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $$
  select case when p_language = 'en' then
    'Personal data of applicants. You receive it solely to select participants for your format at Future Leader Summit 2027. You are the controller for this processing. Delete the data once the selection is complete, at the latest after the summit. Do not use it for any other purpose and do not pass it on. Only applicants who consented to sharing are included.'
  else
    'Personenbezogene Daten von Bewerberinnen und Bewerbern. Ihr erhaltet sie ausschließlich, um die Teilnehmenden eures Formats beim Future Leader Summit 2027 auszuwählen. Für diese Verarbeitung seid ihr verantwortlich. Löscht die Daten, sobald die Auswahl abgeschlossen ist, spätestens nach dem Summit. Nutzt sie für keinen anderen Zweck und gebt sie nicht weiter. Enthalten sind nur Bewerbungen, deren Einwilligung zur Weitergabe vorliegt.'
  end
$$;
