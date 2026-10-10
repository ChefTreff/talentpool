create or replace function set_org_hiring(p_org_id uuid, p_id uuid, p_career_opportunity text, p_function_area text, p_role_text text, p_skills text[], p_study_fields text[], p_published boolean, p_edition_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare
  v_oe org_edition; v_row org_hiring; v_id uuid; v_n integer; v_el text; v_neu boolean := p_id is null;
  v_career text := nullif(btrim(coalesce(p_career_opportunity, '')), '');
  v_area   text := nullif(btrim(coalesce(p_function_area, '')), '');
  v_role   text := nullif(btrim(coalesce(p_role_text, '')), '');
  v_skills text[]; v_fields text[];
  v_max constant integer := 10;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_org_id is null or not partner_can_edit(p_org_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  v_oe := current_org_edition(p_org_id, p_edition_id);
  if v_oe.id is null then raise exception 'org_edition_not_found' using errcode = 'P0002', detail = p_org_id::text; end if;

  -- Erst der bestehende Eintrag, dann der neue Zustand: wer ihn nicht bearbeiten darf, soll weder Werte noch Fehler an ihm lernen.
  if p_id is not null then
    select * into v_row from org_hiring where id = p_id for update;
    if not found then raise exception 'hiring_not_found' using errcode = 'P0002'; end if;
    if v_row.org_edition_id <> v_oe.id then raise exception 'not allowed' using errcode = '42501'; end if;
  end if;

  if v_career is null then raise exception 'invalid_hiring' using errcode = '22023', detail = 'career_opportunity'; end if;
  if v_area is null then raise exception 'invalid_hiring' using errcode = '22023', detail = 'function_area'; end if;
  if v_role is not null and length(v_role) > 120 then raise exception 'invalid_hiring' using errcode = '22023', detail = 'role_text'; end if;
  if not is_vocab_key('career_opportunities', v_career) then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'career_opportunities:' || v_career;
  end if;
  -- „Ich bin aktuell nicht interessiert an Jobangeboten“ beschreibt eine Person, nicht das, was ein Partner bietet (wie im Wunschprofil).
  if v_career = 'nicht-interessiert' then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'career_opportunities:' || v_career;
  end if;
  if not is_vocab_key('function_area', v_area) then
    raise exception 'invalid_vocab' using errcode = '22023', detail = 'function_area:' || v_area;
  end if;

  v_skills := array(select distinct btrim(x) from unnest(coalesce(p_skills, '{}'::text[])) x where nullif(btrim(x), '') is not null order by 1);
  foreach v_el in array v_skills loop
    if not is_vocab_key('skill', v_el) then raise exception 'invalid_vocab' using errcode = '22023', detail = 'skill:' || v_el; end if;
  end loop;
  v_fields := array(select distinct btrim(x) from unnest(coalesce(p_study_fields, '{}'::text[])) x where nullif(btrim(x), '') is not null order by 1);
  foreach v_el in array v_fields loop
    if not is_vocab_key('study_field', v_el) then raise exception 'invalid_vocab' using errcode = '22023', detail = 'study_field:' || v_el; end if;
  end loop;

  if v_neu then
    -- Die Sperre auf der Org-Edition reiht gleichzeitige Anlagen hintereinander, sonst ergäben zwei Klicks auf den zehnten Eintrag elf.
    perform 1 from org_edition where id = v_oe.id for update;
    select count(*)::integer into v_n from org_hiring where org_edition_id = v_oe.id;
    if v_n >= v_max then raise exception 'too_many_hiring' using errcode = 'P0001', detail = v_max::text; end if;
    insert into org_hiring (org_edition_id, career_opportunity, function_area, role_text, skills, study_fields, published, created_by)
    values (v_oe.id, v_career, v_area, v_role, v_skills, v_fields, coalesce(p_published, false), current_person_id())
    returning id into v_id;
  else
    update org_hiring
       set career_opportunity = v_career, function_area = v_area, role_text = v_role, skills = v_skills, study_fields = v_fields,
           published = coalesce(p_published, false), updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;

  perform log_audit('partner.org_hiring', 'org_edition', v_oe.id::text, null,
                    jsonb_build_object('org_id', p_org_id, 'hiring_id', v_id, 'neu', v_neu,
                                       'career_opportunity', v_career, 'function_area', v_area,
                                       'published', coalesce(p_published, false),
                                       'skills', cardinality(v_skills), 'study_fields', cardinality(v_fields)));
  return v_id;
end $$;
