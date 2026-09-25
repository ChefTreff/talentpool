-- Links je Schlüssel, gepflegt im Admin unter Videos — zuerst die Store-Links der Event-App (PART-072)
--
-- **Ohne Nummer** (Regel vom 24.09.): die Architektur-Session vergibt sie beim Anwenden.
--
-- Anlass: PART-072 (Konrad 21./24.09.) — „Store-Links fehlen … Pflege im Admin wie Videos (die Apps
-- werden in Kürze angepasst); auch für TAL-014“. Bisher stehen die beiden Adressen als Konstante in
-- `lib/event-app/store-links.ts` (seit #136); diese Migration ersetzt die Datei. Runde 26.09.: Pflege
-- im Admin im Videos-Bereich als Links, bis ADM-063 die zentrale Medienverwaltung bringt.
--
-- Warum nicht `portal_video`: dort gilt **nur Loom** (CHECK und CSP gehören zusammen, die Seiten
-- betten ein). Ein Store-Link wird nicht eingebettet, sondern verlinkt — eigene Tabelle, dieselbe Form:
-- * `portal_link` (Schlüssel, Titel DE/EN, https-Adresse, Zielgruppen, optional Edition, Reihenfolge);
--   RLS an, **keine Policies und keine Grants** — gelesen und geschrieben wird nur über die Funktionen;
-- * `portal_links_for(keys, audience, edition)` — für jede angemeldete Person mit dieser Zielgruppe
--   (`my_kb_audiences`, wie `portal_video_for`); je Schlüssel eine Zeile, die der Edition vor der
--   allgemeinen;
-- * `portal_links_admin()`, `upsert_portal_link(data)`, `delete_portal_link(id)` — wie bei den Videos
--   `is_staff()`, jede Änderung im Audit;
-- * die beiden Store-Links als Startwerte (Stammdaten ohne Personenbezug), für alle Zielgruppen —
--   die Event-App nutzen alle Teilnehmenden.
-- Fehlerschlüssel: `portal_link_url` (nur https, höchstens 500 Zeichen), `portal_link_key`
-- (a–z, 0–9, _; 2–60 Zeichen), `invalid_audience` (neu ohne Zielgruppe oder unbekannte),
-- `link_not_found` (P0002). Eigene Schlüssel statt `invalid_link_url`: dessen Text erlaubt auch
-- Portalpfade, hier gilt nur https.

set search_path = public, extensions;

create table portal_link (
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  title_de text,
  title_en text,
  url text not null check (url ~ '^https://[^[:space:]]+$' and length(url) <= 500),
  audience text[] not null default '{}'
    check (audience <@ array['partner','speaker','talent','volunteer','hackathon']::text[]),
  edition_id uuid references event (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ein Schlüssel je Edition, und einer ohne Edition (gilt für alle).
create unique index portal_link_key_edition_uniq
  on portal_link (key, coalesce(edition_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table portal_link enable row level security;
revoke all on portal_link from anon, authenticated;

comment on table portal_link is
  'Links je Schlüssel (PART-072: Store-Links der Event-App). Seiten lesen über portal_links_for, gepflegt unter /admin/videos. Anders als portal_video nicht nur Loom — hier wird verlinkt, nicht eingebettet.';

create or replace function portal_links_for(p_keys text[], p_audience text, p_edition_id uuid default null)
 returns table (key text, title_de text, title_en text, url text)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Dieselbe Edition wie bei den Videos: die laufende, sonst die jüngste.
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select distinct on (l.key) l.key, l.title_de, l.title_en, l.url
      from portal_link l
     where l.key = any(p_keys)
       and l.audience && array[p_audience]
       and (l.edition_id = v_ed or l.edition_id is null)
     order by l.key, l.edition_id nulls last;
end $$;

create or replace function portal_links_admin()
 returns table (id uuid, key text, title_de text, title_en text, url text, audience text[],
                edition_id uuid, edition_slug text, sort_order integer)
 language plpgsql
 stable security definer
 set search_path = public, extensions
as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select l.id, l.key, l.title_de, l.title_en, l.url, l.audience, l.edition_id, e.slug, l.sort_order
      from portal_link l left join event e on e.id = l.edition_id
     order by l.sort_order, l.key;
end $$;

create or replace function upsert_portal_link(p_data jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
declare v_id uuid; v_url text; v_key text; v_aud text[];
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_url := btrim(coalesce(p_data->>'url', ''));
  v_key := btrim(coalesce(p_data->>'key', ''));
  -- Früh und mit eigenem Schlüssel abweisen: ein 23514 aus dem CHECK sagt der Redaktion nichts.
  if v_id is null or v_url <> '' then
    if v_url !~ '^https://[^[:space:]]+$' or length(v_url) > 500 then
      raise exception 'portal_link_url' using errcode = '22023', detail = coalesce(nullif(v_url, ''), 'leer');
    end if;
  end if;
  if v_id is null or v_key <> '' then
    if v_key !~ '^[a-z0-9_]{2,60}$' then
      raise exception 'portal_link_key' using errcode = '22023', detail = coalesce(nullif(v_key, ''), 'leer');
    end if;
  end if;
  v_aud := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)), '{}');
  -- Ein neuer Link ohne Zielgruppe wäre für niemanden sichtbar; beim Ändern heißt „leer“ „bleibt“.
  if (v_id is null and cardinality(v_aud) = 0)
     or not (v_aud <@ array['partner','speaker','talent','volunteer','hackathon']::text[]) then
    raise exception 'invalid_audience' using errcode = '22023', detail = coalesce(nullif(array_to_string(v_aud, ','), ''), 'leer');
  end if;

  if v_id is null then
    insert into portal_link (key, title_de, title_en, url, audience, edition_id, sort_order)
    values (v_key, nullif(btrim(p_data->>'title_de'), ''), nullif(btrim(p_data->>'title_en'), ''),
            v_url, v_aud, nullif(p_data->>'edition_id', '')::uuid,
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update portal_link set
      key = case when v_key <> '' then v_key else key end,
      title_de = case when p_data ? 'title_de' then nullif(btrim(p_data->>'title_de'), '') else title_de end,
      title_en = case when p_data ? 'title_en' then nullif(btrim(p_data->>'title_en'), '') else title_en end,
      url = case when v_url <> '' then v_url else url end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      edition_id = case when p_data ? 'edition_id' then nullif(p_data->>'edition_id', '')::uuid else edition_id end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'link_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('portal_link.upsert', 'portal_link', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_portal_link(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from portal_link where id = p_id;
  if not found then raise exception 'link_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('portal_link.delete', 'portal_link', p_id::text, null, null);
end $$;

grant execute on function portal_links_for(text[], text, uuid) to authenticated;
grant execute on function portal_links_admin() to authenticated;
grant execute on function upsert_portal_link(jsonb) to authenticated;
grant execute on function delete_portal_link(uuid) to authenticated;

-- Startwerte: die Adressen aus lib/event-app/store-links.ts (Konrad 21./24.09.). Ohne Edition,
-- also für jede — tauscht die App den Eintrag im Store, ändert Konrad hier den Link.
insert into portal_link (key, title_de, title_en, url, audience, sort_order) values
  ('event_app_app_store', 'App Store', 'App Store',
   'https://apps.apple.com/de/app/fls-2026/id6479501389',
   array['partner','speaker','talent','volunteer','hackathon'], 10),
  ('event_app_google_play', 'Google Play', 'Google Play',
   'https://play.google.com/store/apps/details?id=com.swapcard.apps.android.cheftreffdeutsch',
   array['partner','speaker','talent','volunteer','hackathon'], 20)
on conflict do nothing;

select harden_definer_functions();
