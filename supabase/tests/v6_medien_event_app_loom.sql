-- Test zu `v6_medien_event_app_loom` (ADM-009). Belegt:
--   01 genau eine Zeile am Schlüssel partner_event_app mit dem Loom, Zielgruppe partner;
--   02 sie trifft die Zielgruppe partner (die `portal_video_for` für
--      /partner/event-app filtert), nicht speaker (Gegenprobe, dieselbe Abfrage).
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_n integer; v_txt text;
begin
  select count(*) into v_n from portal_video
   where key = 'partner_event_app' and url = 'https://www.loom.com/share/67013b2c5a1a42cfbd2ee1a045a9bc5c' and audience = array['partner'];
  insert into t_res values ('01_zeile', v_n || ' (erwartet 1)');
  select string_agg(v.key, ',') into v_txt from portal_video v where v.key = 'partner_event_app' and v.audience && array['partner'];
  insert into t_res values ('02a_zielgruppe_partner', coalesce(v_txt, '-') || ' (erwartet partner_event_app)');
  select count(*) into v_n from portal_video v where v.key = 'partner_event_app' and v.audience && array['speaker'];
  insert into t_res values ('02b_gegenprobe_speaker', v_n || ' (erwartet 0)');
end $$;
select * from t_res order by step;
rollback;
