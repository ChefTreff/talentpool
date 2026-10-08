create or replace function set_mail_template_meta(p_key text, p_category text DEFAULT NULL::text, p_name_de text DEFAULT NULL::text, p_name_en text DEFAULT NULL::text, p_variables text[] DEFAULT NULL::text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt mail_template_key%rowtype; v_cat text := nullif(btrim(coalesce(p_category, '')), '');
        v_de text := nullif(btrim(coalesce(p_name_de, '')), ''); v_en text := nullif(btrim(coalesce(p_name_en, '')), '');
        v_var text[]; v_neu mail_template_key%rowtype;
begin
  if nullif(btrim(coalesce(p_key, '')), '') is null then raise exception 'fields_required' using errcode = '22023', detail = 'key'; end if;
  if not can_edit_mail_template(p_key) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from mail_template t where t.key = p_key) then
    raise exception 'template_not_found' using errcode = 'P0002', detail = p_key;
  end if;
  -- Die Kategorie bestimmt, wer die Vorlage sieht — das entscheidet `admin`, nicht der Bereich. Dasselbe für die Platzhalter.
  if (v_cat is not null or p_variables is not null) and not has_admin_section('mail') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_cat is not null and not is_vocab_key('mail_category', v_cat) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_cat;
  end if;
  if p_variables is not null then
    select coalesce(array_agg(distinct lower(btrim(x)) order by lower(btrim(x))), '{}') into v_var
      from unnest(p_variables) as x where btrim(x) ~ '^[A-Za-z0-9_]+$';
    if cardinality(v_var) <> (select count(distinct lower(btrim(x))) from unnest(p_variables) as x) then
      raise exception 'fields_required' using errcode = '22023', detail = 'variables';
    end if;
  end if;

  select * into v_alt from mail_template_key where key = p_key;
  if not found then
    insert into mail_template_key (key, category, name_de, name_en, variables)
      values (p_key, coalesce(v_cat, 'system'), coalesce(v_de, p_key), coalesce(v_en, p_key), coalesce(v_var, '{}'))
      returning * into v_neu;
  else
    update mail_template_key set
      category = coalesce(v_cat, category), name_de = coalesce(v_de, name_de), name_en = coalesce(v_en, name_en),
      variables = coalesce(v_var, variables), updated_at = now()
     where key = p_key returning * into v_neu;
  end if;
  if v_alt is not distinct from v_neu then return; end if;
  perform log_audit('mail_template.meta', 'mail_template', p_key,
                    case when v_alt.key is null then null
                         else jsonb_build_object('category', v_alt.category, 'name_de', v_alt.name_de, 'name_en', v_alt.name_en, 'variables', to_jsonb(v_alt.variables)) end,
                    jsonb_build_object('category', v_neu.category, 'name_de', v_neu.name_de, 'name_en', v_neu.name_en, 'variables', to_jsonb(v_neu.variables)));
end $$;
