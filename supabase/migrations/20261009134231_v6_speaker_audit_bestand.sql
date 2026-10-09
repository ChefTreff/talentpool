-- 0302 · Bestandseinträge des Assistenz-Audits ohne Klartext (SPK-095)
-- Angewendet von der Architektur-Session am 09.10.2026 als 20261009134231.
-- Nummer und Zeitstempel vergibt die Architektur-Session beim Anwenden.
--
-- Anlass: SPK-094 (0301) lässt `update_my_speaker_profile` ins Audit nur noch die Namen der geänderten Felder und die `person_id` der Speakerin schreiben.
-- Die Einträge davor (`audit_log.action = 'speaker.assistant_update'`) tragen in `after` noch den ganzen Eingabeblock — Telefonnummer, Namen, LinkedIn-Adresse und
-- Bio im Klartext (Befund aus #452). Plan 09.10.2026: bereinigen, als kleine Datenmigration. Die Regel ist die von SPK-094 („Audit ohne Klartext-E-Mail“, #297).
--
-- Was die Migration tut (zwei interne Hilfsfunktionen, eine Datenänderung — keine Tabelle, keine Spalte)
--   1  `speaker_audit_felder(after, person)` — rein, ohne Tabellenzugriff: macht aus einem alten Eingabeblock `{"felder": [<Schlüssel, sortiert>], "person_id": <Person>}`
--      (ohne `person_id`, wenn keine Person bekannt ist). Es bleiben die Namen der Felder, nie ein Wert; sortiert wie im neuen Eintrag von SPK-094.
--   2  `speaker_audit_bereinigen()` — ersetzt `after` bei jedem Eintrag der Aktion `speaker.assistant_update`, dessen `after` ein Objekt ist und **mehr als `felder` und
--      `person_id`** trägt (alles, was nach SPK-094 entsteht, hat nur diese beiden Schlüssel und bleibt unberührt). Die `person_id` kommt aus dem Profil, auf das sich der
--      Eintrag bezieht (`object_id` = `speaker_profile.id`), und fehlt, wenn es das Profil nicht mehr gibt; `before` wird leer gesetzt. Andere Aktionen, ein leeres oder
--      kein Objekt als `after` und schon bereinigte Einträge bleiben, wie sie sind. Gibt die Zahl der geänderten Einträge zurück — der Test ruft sie auf eigenen Zeilen auf.
--   3  Die Migration ruft sie **einmal** auf und prüft danach (Gegenprobe): trägt noch ein Eintrag der Aktion einen Wert, bricht sie ab.
--
-- **Idempotent:** ein zweiter Lauf ändert keine Zeile (Test). **Kein neuer Audit-Eintrag** — eine Datenmigration ohne handelnde Person (wie 0294, Plan 09.10.); die Zahl der
-- Einträge in `audit_log` bleibt gleich (Test). `audit_log` hat weder Trigger noch Regeln; die Migration läuft als `postgres`.
-- Die Hilfsfunktionen sind kein Rechtepunkt: für anon und authenticated nicht ausführbar. Sie dürfen später fallen, wenn niemand sie mehr braucht.
-- Fehlerschlüssel: keine (Datenmigration); die Gegenprobe bricht mit P0001 ab.
set search_path = public, extensions;

create or replace function speaker_audit_felder(p_after jsonb, p_person uuid) returns jsonb
language sql immutable parallel safe
set search_path = public, extensions
as $f$
  select jsonb_build_object('felder', coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(p_after) as k), '[]'::jsonb))
         || case when p_person is null then '{}'::jsonb else jsonb_build_object('person_id', p_person) end
$f$;

comment on function speaker_audit_felder(jsonb, uuid) is
  'SPK-095: aus einem alten Audit-Eingabeblock {felder: [Schluessel sortiert], person_id}. Nie ein Wert. Reiner Umbau.';

create or replace function speaker_audit_bereinigen() returns integer
language plpgsql security definer
set search_path = public, extensions
as $f$
declare v_n integer;
begin
  -- Nur Eintraege, die noch mehr als `felder` und `person_id` tragen; schon bereinigte und die neuen von SPK-094 fallen heraus (idempotent).
  with ziel as (
    select a.id, sp.person_id
      from audit_log a
      left join speaker_profile sp on sp.id::text = a.object_id
     where a.action = 'speaker.assistant_update'
       and jsonb_typeof(a.after) = 'object'
       and a.after - 'felder' - 'person_id' <> '{}'::jsonb
  ), neu as (
    update audit_log a
       set after = speaker_audit_felder(a.after, z.person_id), before = null
      from ziel z
     where a.id = z.id
    returning a.id
  )
  select count(*)::integer into v_n from neu;
  return v_n;
end $f$;

comment on function speaker_audit_bereinigen() is
  'SPK-095: ersetzt in alten speaker.assistant_update-Eintraegen den Eingabeblock durch die Namen der Felder (und die person_id). Idempotent, ohne neuen Audit-Eintrag, intern.';

revoke execute on function speaker_audit_felder(jsonb, uuid) from public, anon, authenticated;
revoke execute on function speaker_audit_bereinigen() from public, anon, authenticated;

do $mig$
declare
  v_n integer;
  v_rest integer;
begin
  v_n := speaker_audit_bereinigen();
  select count(*) into v_rest
    from audit_log a
   where a.action = 'speaker.assistant_update'
     and jsonb_typeof(a.after) = 'object'
     and a.after - 'felder' - 'person_id' <> '{}'::jsonb;
  if v_rest <> 0 then
    raise exception 'Bereinigung unvollstaendig: % Eintraege der Aktion speaker.assistant_update tragen noch Werte', v_rest using errcode = 'P0001';
  end if;
  raise notice 'speaker.assistant_update: % Eintraege bereinigt', v_n;
end $mig$;

select harden_definer_functions();
