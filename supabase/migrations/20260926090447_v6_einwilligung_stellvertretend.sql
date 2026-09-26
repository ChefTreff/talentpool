-- 0215 · Einwilligungen im Verwaltet-Fall stellvertretend durch den Kontakt, protokolliert (SPK-074, K-40)
-- Angewendet von der Architektur-Session am 26.09.2026 als 20260926090447.
--
-- Vorschlag der Build-Session Speaker-Domäne. Nummer, Anwenden, Umbenennen und
-- der Eintrag ins Entscheidungslog gehören der Architektur-Session.
--
-- Im Verwaltet-Fall (PART-091, 0198) hat die Speakerin keinen Zugang; alles
-- läuft über den Kontakt des Partners (`speaker_profile.mail_via_contact_id` →
-- `speaker_contact` mit Zugang). Einwilligungen konnte bisher niemand geben:
-- `cr_self_ins` lässt nur eigene Zeilen mit `source = 'portal'` zu, und das
-- Portal sperrt den Block für alle, die für jemand anderen arbeiten.
--
-- K-40 (Konrad, bestätigt): der Kontakt mit Zugang bestätigt Foto-,
-- Veröffentlichungs- und Folien-Einwilligung **stellvertretend**, protokolliert
-- (wer, wann, für wen). Umsetzung:
--   * `record_speaker_consent_on_behalf` schreibt `consent_record` der
--     Speakerin mit `source = 'stellvertretend'` und `meta` = wer (Person),
--     über welchen Kontakt, für welches Profil; `granted_at` ist das Wann.
--     Nur die drei Arten — `hospitality_data` (Hotel und Shuttle, K-40 nennt sie nicht)
--     bleibt bei der Speakerin selbst. Geschrieben wird nur, was sich ändert
--     (wie `consentRowsToWrite` im Portal). Über `cr_self_ins` ist die Quelle
--     `stellvertretend` nicht erreichbar, sie lässt sich also nicht fälschen.
--   * `can_confirm_consent_on_behalf` sagt dem Portal, ob es den Block
--     stellvertretend öffnet.
--   * `speaker_consents_admin` zeigt dem Team je Art den letzten Stand mit
--     Quelle und — bei stellvertretender Bestätigung — dem Namen des Kontakts.
--
-- Bewusst **ohne** Änderung an `my_speaker_profile` und `speaker_detail`: beide
-- ändern parallele Vorschläge (#241), ein zweites `create or replace` aus dem
-- Snapshot nähme deren Teile still wieder heraus.

set search_path = public, extensions;

-- ---- 1 · Wer darf stellvertretend bestätigen (intern)
-- Kontakt des Profils mit Zugang, Profil im Verwaltet-Fall, und nicht die
-- Speakerin selbst. Liefert die Kontakt-Kennung fürs Protokoll; der Kontakt
-- der Mail-Weiche geht vor.
create or replace function speaker_consent_contact(p_profile_id uuid, p_person_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select c.id
    from speaker_profile sp
    join speaker_contact c on c.profile_id = sp.id
   where sp.id = p_profile_id
     and sp.mail_via_contact_id is not null
     and p_person_id is not null
     and c.person_id = p_person_id
     and c.has_access
     and c.person_id <> sp.person_id
   order by (c.id = sp.mail_via_contact_id) desc, c.created_at
   limit 1
$$;
revoke execute on function speaker_consent_contact(uuid, uuid) from public, anon, authenticated;

-- ---- 2 · Für das Portal: Block stellvertretend öffnen?
create or replace function can_confirm_consent_on_behalf(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
  select speaker_consent_contact(p_profile_id, current_person_id()) is not null
$$;
grant execute on function can_confirm_consent_on_behalf(uuid) to authenticated;

-- ---- 3 · Stellvertretend bestätigen
create or replace function record_speaker_consent_on_behalf(p_profile_id uuid, p_consents jsonb, p_version text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_me uuid := current_person_id(); v_sp speaker_profile%rowtype; v_contact uuid;
  v_key text; v_val jsonb; v_granted boolean; v_vorher record; v_n integer := 0;
begin
  if v_me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if v_sp.mail_via_contact_id is null then
    raise exception 'consent_not_managed' using errcode = 'P0001';
  end if;
  v_contact := speaker_consent_contact(p_profile_id, v_me);
  if v_contact is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' then
    raise exception 'invalid_consents' using errcode = '22023', detail = 'version';
  end if;
  if p_consents is null or jsonb_typeof(p_consents) <> 'object' then
    raise exception 'invalid_consents' using errcode = '22023';
  end if;
  -- Erst alles prüfen, dann schreiben: ein unzulässiger Schlüssel lässt nichts halb stehen.
  for v_key, v_val in select e.key, e.value from jsonb_each(p_consents) e loop
    if v_key not in ('photo_video', 'speaker_release', 'slides_publication') then
      -- `hospitality_data` (Hotel und Shuttle) nennt K-40 nicht — sie bleibt bei der Speakerin selbst.
      raise exception 'consent_type_not_allowed' using errcode = '22023', detail = v_key;
    end if;
    if jsonb_typeof(v_val) <> 'boolean' then
      raise exception 'invalid_consents' using errcode = '22023', detail = v_key;
    end if;
  end loop;

  for v_key, v_val in select e.key, e.value from jsonb_each(p_consents) e loop
    v_granted := v_val::boolean;
    select c.granted, c.version into v_vorher
      from consent_current c where c.person_id = v_sp.person_id and c.consent_type = v_key;
    -- Nur, was neu, umentschieden oder auf eine neuere Textfassung bezogen ist.
    if not found or v_vorher.granted is distinct from v_granted or v_vorher.version is distinct from btrim(p_version) then
      -- Ein Widerruf ist wie im Portal eine Zeile mit `granted = false`.
      insert into consent_record (person_id, consent_type, version, granted, source, meta)
      values (v_sp.person_id, v_key, btrim(p_version), v_granted, 'stellvertretend',
              jsonb_build_object('by_person_id', v_me, 'contact_id', v_contact, 'profile_id', v_sp.id));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
grant execute on function record_speaker_consent_on_behalf(uuid, jsonb, text) to authenticated;

-- ---- 4 · Für das Team: Stand je Art, mit Quelle und Kontakt
create or replace function speaker_consents_admin(p_profile_id uuid)
 RETURNS TABLE(consent_type text, granted boolean, version text, granted_at timestamp with time zone,
               source text, by_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_sp speaker_profile%rowtype;
begin
  select * into v_sp from speaker_profile where id = p_profile_id;
  if not found then raise exception 'speaker_not_found' using errcode = 'P0002'; end if;
  if not coalesce(is_speaker_team(v_sp.edition_id), false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select x.consent_type, x.granted, x.version, x.granted_at, x.source,
           case when x.source = 'stellvertretend' then
             (select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
                from person p where p.id = (x.meta->>'by_person_id')::uuid) end
      from (select distinct on (cr.consent_type) cr.*
              from consent_record cr
             where cr.person_id = v_sp.person_id
               and cr.consent_type in ('photo_video', 'speaker_release', 'slides_publication', 'hospitality_data')
             order by cr.consent_type, cr.granted_at desc, cr.created_at desc, cr.id desc) x
     order by x.consent_type;
end $$;
grant execute on function speaker_consents_admin(uuid) to authenticated;

select harden_definer_functions();
