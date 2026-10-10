-- 0000 · Fachbereiche (`function_area`) als Liste am Teilnehmerprofil (K-94 Stufe 1 Teil B, QS-070)
-- Anlass: Konrad 09.10. (K-94), Plan 10.10. Das Matching braucht je Profil mehrere Fachbereiche („Wo möchtest du arbeiten?“); bisher steht eine
-- Einzelauswahl in `person.function_area`.
--   1 `person_interest` erlaubt das Vokabular `function_area` (Prüfsatz `person_interest_vocab_chk`, sonst unverändert); der Fremdschlüssel
--     aufs Vokabular prüft die Schlüssel.
--   2 Bestand: die Einzelauswahl wird einmal in die Liste kopiert (Konflikte fallen weg). Die Spalte `person.function_area` bleibt stehen
--     (Wert wird nicht mehr geschrieben, kein Löschen in dieser Migration); Leser sind die Profilseite und die Admin-Person — beide lesen künftig die Liste.
--   3 Verzeichnis der Vokabularbindungen: `function_area` hängt an `person_interest.term_key`, damit „Wie oft wird der Begriff benutzt?“ die Liste mitzählt.
-- Keine neuen Rechte: Schreiben und Lesen wie bei den übrigen Listen des Profils (eigene Zeilen, Spalten-Grants und RLS unverändert).

alter table person_interest drop constraint if exists person_interest_vocab_chk;
alter table person_interest add constraint person_interest_vocab_chk
  check (vocabulary in ('interests', 'interests_founder', 'career_opportunities',
                        'summit_goal', 'skill', 'work_mode', 'notification_topic', 'function_area'));

insert into person_interest (person_id, vocabulary, term_key)
select p.id, 'function_area', p.function_area
  from person p
 where p.function_area is not null
   and exists (select 1 from vocab_term v where v.vocabulary = 'function_area' and v.key = p.function_area)
on conflict do nothing;

insert into vocab_binding (vocabulary, table_name, column_name, is_array, vocabulary_column, note)
values ('function_area', 'person_interest', 'term_key', false, 'vocabulary', 'Fachbereiche des Profils (K-94)')
on conflict (vocabulary, table_name, column_name) do nothing;

select harden_definer_functions();
