-- 00NN · Personen: durchsuchbare Liste und Stammdaten bearbeiten (ADM-091, ADM-092)
--
-- Anlass: Konrad 08.10.2026 (Admin-Feedback Teil 1): die Personenliste ist „lang, ohne Suche, ohne Filter, ohne relevante
-- Daten“ (ADM-091); die Einzelansicht zeigt Stammdaten nur an — für Änderungsanfragen („ich heisse jetzt …“, „neue
-- Adresse“) muss der Super-Admin sie bearbeiten können, mit Protokoll (ADM-092).
--
-- Drei Funktionen, alle Abschnitt `persons` (heute nur die Rolle admin; Ausnahmen über admin_section_override):
--
--   persons_admin_list(p_query, p_role, p_edition, p_account, p_sort, p_limit, p_offset)
--     Eine Seite der Personen samt Gesamtzahl. Suche: jedes Wort muss in Name, einer E-Mail-Adresse oder dem Arbeitgeber
--     vorkommen (Gross-/Kleinschreibung egal, `%` und `_` zaehlen als Zeichen). Filter: aktive Rolle, Edition (angemeldet
--     oder mit Rolle in der Edition), Konto-Status (`p_account`: NULL = ohne Geloeschte, `alle`, `login`, `ohne_login`,
--     `gesperrt`, `antrag` = Loeschantrag offen, `geloescht`). Sortierung `neu` (Standard) oder `name`. Ein unbekannter
--     Wert fuer Konto-Status oder Sortierung ⇒ 22023 `invalid_filter`, kein stilles „alle“.
--
--   update_person_master(p_person_id, p_patch jsonb) returns text[]
--     Aendert nur die Schluessel, die im Patch stehen: first_name, last_name, title, birthdate, gender, nationality,
--     country, city, phone, linkedin_url, preferred_language. Leer heisst „kein Wert“. Alles andere ⇒ P0001
--     `invalid_person_field` (detail = Feld). Rueckgabe: die tatsaechlich geaenderten Felder (leer = nichts geaendert,
--     dann kein Protokolleintrag). Anonymisierte Personen sind gesperrt (P0001 `person_anonymized`).
--     Protokoll `person.master_updated`: Vorher/Nachher je geaendertem Feld — **ohne** Telefon und Geburtsdatum (dort
--     steht nur der Feldname: Datenminimierung, der Eintrag ueberlebt die Anonymisierung der Person).
--     `phone_e164` bleibt unberuehrt: es ist die private Speaker-Nummer, keine Ableitung von `phone`.
--
--   manage_person_email(p_person_id, p_action, p_email_id, p_email)
--     `add` (weitere Adresse, nicht primaer), `primary` (primaer setzen), `remove` (nur nicht-primaere), `change`
--     (Adresse berichtigen — nur bei Personen **ohne Login**: bei einem Konto stimmt die Anmeldeadresse in auth.users
--     sonst nicht mehr mit der Person ueberein, P0001 `login_email_locked`). Eine Adresse gehoert genau einer Person
--     (`person_email_email_key`): ist sie vergeben ⇒ P0001 `person_email_taken`, detail = Person (Weg: Dubletten).
--     Protokoll `person.email_<aktion>` mit dem Anfang des Hashes, **nie** mit der Adresse.
--
-- Fehlerschluessel: 42501 · 28000 (nicht angemeldet, ueber has_admin_section) · P0002 `person_not_found` ·
-- P0001 `person_anonymized`, `invalid_person_field`, `invalid_email`, `person_email_taken`, `login_email_locked`,
-- `primary_email_required`, `email_not_found` · 22023 `invalid_filter`, `invalid_action`.
set search_path = public, extensions;

create or replace function persons_admin_list(
  p_query text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_edition uuid DEFAULT NULL::uuid,
  p_account text DEFAULT NULL::text, p_sort text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(person_id uuid, first_name text, last_name text, email text, occupation_status text, employer_name text,
               tier text, has_login boolean, blocked_at timestamp with time zone, deleted_at timestamp with time zone,
               deletion_pending boolean, roles text[], editions text[], created_at timestamp with time zone, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
        v_offset integer := greatest(0, coalesce(p_offset, 0));
        v_q text := nullif(btrim(coalesce(p_query, '')), '');
        v_role text := nullif(btrim(coalesce(p_role, '')), '');
        v_account text := nullif(btrim(coalesce(p_account, '')), '');
        v_sort text := coalesce(nullif(btrim(coalesce(p_sort, '')), ''), 'neu');
        v_words text[];
begin
  if not has_admin_section('persons') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_account is not null and v_account not in ('alle', 'login', 'ohne_login', 'gesperrt', 'antrag', 'geloescht') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_account;
  end if;
  if v_sort not in ('neu', 'name') then
    raise exception 'invalid_filter' using errcode = '22023', detail = v_sort;
  end if;
  -- Jedes Wort einzeln, `\`, `%` und `_` als Zeichen: wer „max_” sucht, meint kein Muster.
  select coalesce(array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')), '{}')
    into v_words from unnest(string_to_array(coalesce(v_q, ''), ' ')) as w where w <> '';

  return query
  with treffer as (
    select p.id, p.first_name, p.last_name, p.occupation_status, p.employer_name, p.tier, p.auth_user_id,
           p.access_blocked_at, p.deleted_at, p.created_at,
           (select pe.email::text from person_email pe where pe.person_id = p.id
             order by pe.is_primary desc, pe.created_at limit 1) as email,
           exists (select 1 from profile_deletion_request r where r.person_id = p.id and r.status = 'pending') as antrag,
           count(*) over () as gesamt,
           row_number() over (order by case when v_sort = 'name' then lower(coalesce(p.last_name, '')) end,
                                       case when v_sort = 'name' then lower(coalesce(p.first_name, '')) end,
                                       case when v_sort = 'neu' then p.created_at end desc, p.id) as ord
      from person p
     where (case v_account
              when 'alle' then true
              when 'geloescht' then p.deleted_at is not null
              else p.deleted_at is null end)
       and (v_account is distinct from 'login' or p.auth_user_id is not null)
       and (v_account is distinct from 'ohne_login' or p.auth_user_id is null)
       and (v_account is distinct from 'gesperrt' or p.access_blocked_at is not null)
       and (v_account is distinct from 'antrag'
            or exists (select 1 from profile_deletion_request r where r.person_id = p.id and r.status = 'pending'))
       and (v_role is null or exists (select 1 from role_assignment ra
             where ra.person_id = p.id and ra.role = v_role
               and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())))
       and (p_edition is null
            or exists (select 1 from registration g where g.person_id = p.id and g.event_id = p_edition)
            or exists (select 1 from role_assignment ra where ra.person_id = p.id and ra.edition_id = p_edition))
       and not exists (
             select 1 from unnest(v_words) as w
              where not (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') ilike '%' || w || '%' escape '\'
                      or coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '') ilike '%' || w || '%' escape '\'
                      or coalesce(p.employer_name, '') ilike '%' || w || '%' escape '\'
                      or exists (select 1 from person_email pe where pe.person_id = p.id
                                  and pe.email::text ilike '%' || w || '%' escape '\')))
  ), seite as (
    select * from treffer t where t.ord > v_offset and t.ord <= v_offset + v_limit
  )
  select s.id, s.first_name, s.last_name, s.email, s.occupation_status, s.employer_name, s.tier,
         s.auth_user_id is not null, s.access_blocked_at, s.deleted_at, s.antrag,
         coalesce((select array_agg(distinct ra.role order by ra.role) from role_assignment ra
                    where ra.person_id = s.id and ra.valid_from <= now() and (ra.valid_to is null or ra.valid_to > now())), '{}'),
         coalesce((select array_agg(distinct e.name order by e.name) from event e
                    where e.is_edition
                      and (exists (select 1 from registration g where g.person_id = s.id and g.event_id = e.id)
                           or exists (select 1 from role_assignment ra where ra.person_id = s.id and ra.edition_id = e.id))), '{}'),
         s.created_at, s.gesamt
    from seite s
   order by s.ord;
end $$;

create or replace function update_person_master(p_person_id uuid, p_patch jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_felder constant text[] := array['first_name', 'last_name', 'title', 'birthdate', 'gender', 'nationality',
                                    'country', 'city', 'phone', 'linkedin_url', 'preferred_language'];
  -- Diese beiden stehen nicht im Protokoll, nur ihr Name (siehe Kopf).
  v_still constant text[] := array['birthdate', 'phone'];
  v_k text; v_wert text; v_alt jsonb; v_neu jsonb; v_geaendert text[] := '{}';
  v_vorher jsonb := '{}'; v_nachher jsonb := '{}'; v_datum date;
begin
  if not has_admin_section('persons') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_person_field' using errcode = 'P0001', detail = 'patch';
  end if;
  select jsonb_build_object('first_name', p.first_name, 'last_name', p.last_name, 'title', p.title,
           'birthdate', p.birthdate, 'gender', p.gender, 'nationality', p.nationality, 'country', p.country,
           'city', p.city, 'phone', p.phone, 'linkedin_url', p.linkedin_url, 'preferred_language', p.preferred_language)
    into v_alt from person p where p.id = p_person_id for update;
  if v_alt is null then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  if exists (select 1 from person p where p.id = p_person_id and p.deleted_at is not null) then
    raise exception 'person_anonymized' using errcode = 'P0001', detail = p_person_id::text;
  end if;

  v_neu := v_alt;
  for v_k in select jsonb_object_keys(p_patch) loop
    if not (v_k = any (v_felder)) then
      raise exception 'invalid_person_field' using errcode = 'P0001', detail = left(v_k, 40);
    end if;
    if jsonb_typeof(p_patch -> v_k) not in ('string', 'null') then
      raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
    end if;
    v_wert := nullif(btrim(coalesce(p_patch ->> v_k, '')), '');
    if v_wert is not null and length(v_wert) > 200 then
      raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
    end if;
    if v_wert is not null then
      if v_k = 'birthdate' then
        begin v_datum := v_wert::date; exception when others then
          raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k; end;
        if v_datum < date '1900-01-01' or v_datum > current_date then
          raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
        end if;
        v_wert := v_datum::text;
      elsif v_k = 'gender' and not is_vocab_key('gender', v_wert) then
        raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
      elsif v_k = 'preferred_language' and v_wert not in ('de', 'en') then
        raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
      elsif v_k = 'linkedin_url' and v_wert !~* '^https?://[^\s]+$' then
        raise exception 'invalid_person_field' using errcode = 'P0001', detail = v_k;
      end if;
    end if;
    v_neu := jsonb_set(v_neu, array[v_k], coalesce(to_jsonb(v_wert), 'null'::jsonb));
  end loop;

  foreach v_k in array v_felder loop
    if (v_alt -> v_k) is distinct from (v_neu -> v_k) then
      v_geaendert := v_geaendert || v_k;
      if not (v_k = any (v_still)) then
        v_vorher := v_vorher || jsonb_build_object(v_k, v_alt -> v_k);
        v_nachher := v_nachher || jsonb_build_object(v_k, v_neu -> v_k);
      end if;
    end if;
  end loop;
  if cardinality(v_geaendert) = 0 then return v_geaendert; end if;

  update person set
    first_name = v_neu ->> 'first_name', last_name = v_neu ->> 'last_name', title = v_neu ->> 'title',
    birthdate = (v_neu ->> 'birthdate')::date, gender = v_neu ->> 'gender', nationality = v_neu ->> 'nationality',
    country = v_neu ->> 'country', city = v_neu ->> 'city', phone = v_neu ->> 'phone',
    linkedin_url = v_neu ->> 'linkedin_url', preferred_language = v_neu ->> 'preferred_language'
   where id = p_person_id;
  perform log_audit('person.master_updated', 'person', p_person_id::text,
                    v_vorher || jsonb_build_object('felder', to_jsonb(v_geaendert)),
                    v_nachher || jsonb_build_object('felder', to_jsonb(v_geaendert)));
  return v_geaendert;
end $$;

create or replace function manage_person_email(p_person_id uuid, p_action text, p_email_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_login boolean; v_geloescht boolean; v_zeile person_email%rowtype;
  v_mail text := lower(btrim(coalesce(p_email, '')));
  v_besitzer uuid; v_neu_id uuid;
begin
  if not has_admin_section('persons') then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_action is null or p_action not in ('add', 'primary', 'remove', 'change') then
    raise exception 'invalid_action' using errcode = '22023', detail = coalesce(p_action, '');
  end if;
  select p.auth_user_id is not null, p.deleted_at is not null into v_login, v_geloescht
    from person p where p.id = p_person_id for update;
  if v_login is null then raise exception 'person_not_found' using errcode = 'P0002', detail = p_person_id::text; end if;
  if v_geloescht then raise exception 'person_anonymized' using errcode = 'P0001', detail = p_person_id::text; end if;

  if p_action in ('add', 'change') then
    if length(v_mail) > 254 or v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'invalid_email' using errcode = 'P0001';
    end if;
    select pe.person_id into v_besitzer from person_email pe where pe.email = v_mail::citext
       and (p_action = 'add' or pe.id is distinct from p_email_id);
    if v_besitzer is not null then
      raise exception 'person_email_taken' using errcode = 'P0001', detail = v_besitzer::text;
    end if;
  end if;

  if p_action = 'add' then
    insert into person_email (person_id, email, type, is_primary, verified)
      values (p_person_id, v_mail::citext, 'private', false, false) returning id into v_neu_id;
    perform log_audit('person.email_add', 'person', p_person_id::text, null,
                      jsonb_build_object('email_id', v_neu_id, 'email_hash', left(email_hash(v_mail), 12)));
    return;
  end if;

  select * into v_zeile from person_email where id = p_email_id and person_id = p_person_id;
  if not found then raise exception 'email_not_found' using errcode = 'P0001', detail = coalesce(p_email_id::text, ''); end if;

  if p_action = 'primary' then
    -- Zwei Anweisungen: der partielle Unique-Index (eine primaere je Person) prueft zeilenweise, die
    -- Genau-eine-Pruefung erst beim Commit. Erst die alte abwaehlen, dann die neue setzen.
    update person_email set is_primary = false where person_id = p_person_id and is_primary and id <> p_email_id;
    update person_email set is_primary = true where id = p_email_id;
    perform log_audit('person.email_primary', 'person', p_person_id::text, null,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)));
  elsif p_action = 'remove' then
    if v_zeile.is_primary then raise exception 'primary_email_required' using errcode = 'P0001'; end if;
    delete from person_email where id = p_email_id;
    perform log_audit('person.email_remove', 'person', p_person_id::text,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)), null);
  else
    if v_login then raise exception 'login_email_locked' using errcode = 'P0001'; end if;
    update person_email set email = v_mail::citext, verified = false where id = p_email_id;
    perform log_audit('person.email_change', 'person', p_person_id::text,
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_zeile.email::text), 12)),
                      jsonb_build_object('email_id', p_email_id, 'email_hash', left(email_hash(v_mail), 12)));
  end if;
end $$;

select harden_definer_functions();
