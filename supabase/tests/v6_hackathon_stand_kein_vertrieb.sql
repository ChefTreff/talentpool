-- Test zu `v6_hackathon_stand_kein_vertrieb` (ADM-047). Belegt:
--   01 der Artikel ist noch da und aktiv — nicht gelöscht;
--   02 `source_hubspot` ist aus, der Kommentar nennt den Grund;
--   03 der HubSpot-Abgleich nimmt ihn nicht mehr mit, SevDesk weiter;
--   04 Gegenprobe: die Hackathon Challenge bleibt im HubSpot-Abgleich;
--   05 ein zweiter Lauf ändert nichts mehr (der Kommentar wird nicht verdoppelt).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_uid uuid; v_email text; v_me uuid; v_txt text; v_n integer;
begin
  select p.id, p.auth_user_id, pe.email::text into v_me, v_uid, v_email
    from person p join person_email pe on pe.person_id = p.id and pe.is_primary
   where p.auth_user_id is not null and p.deleted_at is null limit 1;

  select 'aktiv=' || p.active::text into v_txt from product p where p.sku = 'I-10729';
  insert into t_res values ('01_noch_da', coalesce(v_txt, 'GELÖSCHT (BUG)'));

  select 'hubspot=' || p.source_hubspot::text || ', Kommentar=' || (p.internal_comment like '%ADM-047%')::text
    into v_txt from product p where p.sku = 'I-10729';
  insert into t_res values ('02_aus_dem_vertrieb', v_txt || ' (erwartet false, true)');

  perform set_config('request.jwt.claims', '', true);
  delete from role_assignment where person_id = v_me;
  insert into role_assignment (person_id, role, scope_type) values (v_me, 'partner_team', 'global');
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uid, 'role', 'authenticated', 'email', v_email)::text, true);

  insert into t_res values ('03_abgleich',
    'hubspot=' || exists(select 1 from products_for_sync('hubspot') s where s.sku = 'I-10729')::text ||
    ', sevdesk=' || exists(select 1 from products_for_sync('sevdesk') s where s.sku = 'I-10729')::text ||
    ' (erwartet false, true)');
  insert into t_res values ('04_challenge_bleibt',
    exists(select 1 from products_for_sync('hubspot') s where s.sku = 'I-37220')::text || ' (erwartet true)');

  perform set_config('request.jwt.claims', '', true);
  update product set source_hubspot = false,
         internal_comment = concat_ws(E'\n', nullif(internal_comment, ''), 'ADM-047 doppelt')
   where sku = 'I-10729' and source_hubspot;
  get diagnostics v_n = row_count;
  insert into t_res values ('05_zweiter_lauf', v_n::text || ' Zeilen (erwartet 0)');
end $$;
select * from t_res order by step;
rollback;
