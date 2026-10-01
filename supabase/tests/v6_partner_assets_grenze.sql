-- Test „partner-assets 100 MB“ (0239, v6_partner_assets_grenze.sql). Belegt:
--   01 partner-assets erlaubt 104857600 Byte, Typliste unverändert (12 Typen), weiterhin privat;
--   02 kein anderer Bucket hat sich bewegt (speaker-assets 100 MB, edition-files 25 MB, person-cv 10 MB);
--   03 die vier Policies des Buckets stehen weiter (read/insert/update/delete).
-- Probelauf der Architektur-Session am 01.10.2026 (`sh scripts/db.sh dry-run`): 3 von 3 Schritten grün.
begin;
create temp table t_res (step text, result text) on commit drop;
do $$
declare v_limit bigint; v_n int; v_pub boolean; v_s text; v_p int;
begin
  select file_size_limit, coalesce(array_length(allowed_mime_types, 1), 0), public into v_limit, v_n, v_pub
    from storage.buckets where id = 'partner-assets';
  insert into t_res values ('01_partner_assets', case when v_limit = 104857600 and v_n = 12 and not v_pub then 'ok'
                                                        else format('FEHLER limit=%s typen=%s public=%s', v_limit, v_n, v_pub) end);
  select string_agg(id || '=' || file_size_limit, ',' order by id) into v_s
    from storage.buckets where id in ('speaker-assets', 'edition-files', 'person-cv');
  insert into t_res values ('02_andere_buckets', case when v_s = 'edition-files=26214400,person-cv=10485760,speaker-assets=104857600' then 'ok' else 'FEHLER ' || v_s end);
  select count(*) into v_p from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'partner assets %';
  insert into t_res values ('03_policies', case when v_p = 4 then 'ok' else 'FEHLER ' || v_p end);
end $$;
select * from t_res order by step;
rollback;
