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
