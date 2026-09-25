create or replace function partner_set_tour_wish(p_stop_id uuid, p_application_id uuid, p_wish boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
declare v_st company_tour_stop; v_session uuid; v_app application; v_n integer;
begin
  if current_person_id() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  -- Die Sperre auf der Stopp-Zeile reiht gleichzeitige Wünsche desselben Stopps hintereinander,
  -- sonst ergäben zwei Klicks auf den fünften Wunsch sechs.
  select * into v_st from company_tour_stop where id = p_stop_id for update;
  if not found then raise exception 'stop_not_found' using errcode = 'P0002'; end if;
  if v_st.host_org_id is null or not partner_can_edit(v_st.host_org_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select ct.session_id into v_session from company_tour ct where ct.id = v_st.tour_id;
  select * into v_app from application a where a.id = p_application_id;
  if not found or v_session is null or v_app.session_id is distinct from v_session then
    raise exception 'application_not_found' using errcode = 'P0002';
  end if;

  if coalesce(p_wish, false) then
    -- Wen der Partner nicht sehen darf, kann er auch nicht wünschen.
    if not v_app.consent_share then raise exception 'application_not_shared' using errcode = 'P0001'; end if;
    if not exists (select 1 from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = p_application_id) then
      select count(*)::integer into v_n from company_tour_wish w where w.stop_id = p_stop_id;
      if v_n >= 5 then raise exception 'too_many_wishes' using errcode = 'P0001', detail = '5'; end if;
      insert into company_tour_wish (stop_id, application_id, created_by)
      values (p_stop_id, p_application_id, current_person_id());
    end if;
  else
    delete from company_tour_wish w where w.stop_id = p_stop_id and w.application_id = p_application_id;
  end if;

  select count(*)::integer into v_n from company_tour_wish w where w.stop_id = p_stop_id;
  perform log_audit(case when coalesce(p_wish, false) then 'partner.tour_wish' else 'partner.tour_wish_remove' end,
                    'company_tour_stop', p_stop_id::text, null,
                    jsonb_build_object('org_id', v_st.host_org_id, 'application_id', p_application_id, 'count', v_n));
  return v_n;
end $$;
