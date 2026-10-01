create or replace function set_logo_category(p_org_edition_id uuid, p_category text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_alt text; v_neu text := nullif(btrim(coalesce(p_category, '')), '');
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not has_admin_section('logoWall') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_neu is not null and not exists (select 1 from vocab_term v where v.vocabulary = 'logo_category' and v.active and v.key = v_neu) then
    raise exception 'invalid_category' using errcode = '22023', detail = v_neu;
  end if;
  select oe.logo_category into v_alt from org_edition oe where oe.id = p_org_edition_id for update;
  if not found then raise exception 'org_edition_not_found' using errcode = 'P0002'; end if;
  update org_edition set logo_category = v_neu where id = p_org_edition_id;
  perform log_audit('partner.logo_category', 'org_edition', p_org_edition_id::text,
                    jsonb_build_object('logo_category', v_alt), jsonb_build_object('logo_category', v_neu));
  return (select lc.category from logo_category_of(p_org_edition_id) lc);
end $$;
