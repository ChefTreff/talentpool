-- Smoke-Test zum Vorschlag v6_speaker_fotos_privat (SPK-047). Nur Lesen von
-- `storage.buckets` und `pg_policies`, keine Daten.
--
--   01 speaker-photos ist privat                                            (gegen live: öffentlich)
--   02 keine Policy auf storage.objects nennt speaker-photos (kein Lesen für anon/authenticated)
--                                                                           (gegen live: schon so — Wächter)
--   03 nur der eine Bucket geändert: partner-logos bleibt öffentlich, speaker-assets privat
--                                                                           (gegen live: schon so — Wächter)
--   04 Grenze und Medientypen von speaker-photos unverändert (10 MB, JPEG/PNG/WebP)
begin;
create temp table t_res (step text, result text) on commit drop;
insert into t_res
select '01_speaker_photos_privat', case when count(*) = 1 and bool_and(not b.public) then 'ok'
                                        else 'FEHLER public=' || coalesce(string_agg(b.public::text, ','), 'Bucket fehlt') end
  from storage.buckets b where b.id = 'speaker-photos';
insert into t_res
select '02_keine_policy_fuer_clients',
       case when count(*) = 0 then 'ok' else 'FEHLER ' || string_agg(policyname, ', ') end
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%speaker-photos%';
insert into t_res
select '03_andere_buckets_unveraendert',
       case when count(*) = 2 and bool_and(case b.id when 'partner-logos' then b.public else not b.public end) then 'ok'
            else 'FEHLER ' || coalesce(string_agg(b.id || '=' || b.public, ', '), 'Buckets fehlen') end
  from storage.buckets b where b.id in ('partner-logos', 'speaker-assets');
insert into t_res
select '04_grenzen_unveraendert',
       case when b.file_size_limit = 10485760
                 and b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']
                 and cardinality(b.allowed_mime_types) = 3 then 'ok'
            else 'FEHLER limit=' || coalesce(b.file_size_limit::text, '?') || ' typen=' || coalesce(array_to_string(b.allowed_mime_types, ','), '?') end
  from storage.buckets b where b.id = 'speaker-photos';
select * from t_res order by step;
rollback;
