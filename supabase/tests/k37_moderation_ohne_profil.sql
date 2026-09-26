-- Nachweis K-37 (26.09.2026): **keine Moderation ohne Speaker-Profil geht nach
-- Swapcard hinaus.**
--
-- Konrads Entscheidung: Moderationen stehen nicht als Speaker in der Event-App;
-- nimmt eine echte Panel-Moderation teil, wird die Person regulaer als Speaker
-- angelegt. Fuer den Export aendert sich nichts — er liest `speaker_profile`.
--
-- Ein Blick in den Funktionsrumpf wuerde das behaupten; dieser Test **zeigt** es:
-- er legt genau den Fall an, um den es geht (eine Person mit Moderatorenrolle an
-- einer Session, ohne Profil), und prueft, dass sie im Export fehlt. Ohne diese
-- Vorbedingung waere „0 Treffer" nur die Aussage, dass der Bestand leer ist.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_ed uuid; v_person uuid; v_session uuid; v_n integer; v_vorher integer;
begin
  perform set_config('request.jwt.claims', '', true);  -- Servicekontext
  select id into v_ed from event where is_edition and slug = 'fls27';
  select count(*) into v_vorher from event_app_speakers(v_ed);

  insert into person (first_name, last_name) values ('Zora', 'ZZTEST-Moderation') returning id into v_person;
  insert into person_email (person_id, email, is_primary) values (v_person, 'zztest-moderation@example.org', true);
  insert into session (event_id, format, title_de) values (v_ed, 'talk', 'ZZTEST Panel') returning id into v_session;
  insert into session_speaker (session_id, person_id, role, confirmed)
  values (v_session, v_person, 'moderator', true);

  insert into t_res values ('01_vorbedingung',
    'Moderation angelegt, Profil vorhanden: '
    || (exists (select 1 from speaker_profile sp where sp.person_id = v_person))::text);

  select count(*) into v_n from event_app_speakers(v_ed) x where x.person_id = v_person;
  insert into t_res values ('02_nicht_im_export', v_n::text || ' Treffer (erwartet 0)');

  select count(*) into v_n from event_app_speakers(v_ed);
  insert into t_res values ('03_export_unveraendert',
    v_n::text || ' Speaker, vorher ' || v_vorher::text);

  -- Gegenprobe: **mit** Profil waere sie drin. Sonst bewiese Schritt 02 nur,
  -- dass der Export ueberhaupt niemanden findet.
  insert into speaker_profile (person_id, edition_id, speaker_type, pipeline_status)
  values (v_person, v_ed, 'keynote', 'confirmed');
  select count(*) into v_n from event_app_speakers(v_ed) x where x.person_id = v_person;
  insert into t_res values ('04_gegenprobe_mit_profil', v_n::text || ' Treffer (erwartet 1)');
end $$;

select * from t_res order by step;
rollback;
