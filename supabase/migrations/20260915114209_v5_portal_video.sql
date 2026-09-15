-- 0092 · Welle 5 · Eingebettete Videos zentral verwaltet (F9.4)
--
-- Angewendet von der Architektur-Session am 15.09.2026 nach Review.
--
-- Konrad will Anleitungsvideos in den Portalseiten — und im Admin **eine**
-- Liste, in der die Links austauschbar sind. Der Grund ist praktisch: ein Loom
-- wird jedes Jahr neu aufgenommen, und niemand soll dafür Seiten anfassen
-- müssen. Die Seite bindet über einen **Schlüssel** ein (`ticket_anleitung`),
-- der Link dahinter ist Redaktionssache.
--
-- **Nur Loom.** `portal_video_url_chk` erlaubt ausschliesslich
-- `https://www.loom.com/` und `https://loom.com/`. Ein freies URL-Feld, das in
-- einem iframe landet, ist eine offene Tür: wer im Admin schreiben darf,
-- könnte jede beliebige Seite in unser Portal hängen. Kommt ein zweiter
-- Anbieter dazu, wird der CHECK erweitert **und** die CSP — beides zusammen,
-- sonst lädt das Video nicht und niemand versteht, warum.
--
-- Die Einbettung selbst ist **Zwei-Klick** (`EmbedGate`): erst nach dem Klick
-- auf „Video laden" entsteht der iframe. Vorher geht nichts an Loom, also
-- keine Cookies und keine IP-Übertragung für jemanden, der das Video gar
-- nicht sehen wollte.
--
-- Fehlerschlüssel: 28000 ohne Login · 42501 ohne Recht ·
-- 22023 `invalid_video_url` · P0002 `video_not_found`.

set search_path = public, extensions;

create table if not exists portal_video (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  title_de    text,
  title_en    text,
  url         text not null,
  audience    text[] not null default '{}',
  -- NULL heisst: gilt für jede Edition. So überlebt ein allgemeines
  -- Erklärvideo den Jahreswechsel, ohne kopiert zu werden.
  edition_id  uuid references event(id) on delete cascade,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint portal_video_key_chk check (btrim(key) <> ''),
  constraint portal_video_audience_chk check (cardinality(audience) > 0),
  constraint portal_video_url_chk
    check (url like 'https://www.loom.com/%' or url like 'https://loom.com/%')
);

comment on table portal_video is
  'Eingebettete Videos je Schlüssel (F9.4). Seiten binden über `key` ein, der Link ist Redaktionssache. Nur Loom — der CHECK und die CSP gehören zusammen.';

create unique index if not exists portal_video_key_edition_uidx
  on portal_video (key, edition_id) where edition_id is not null;
create unique index if not exists portal_video_key_global_uidx
  on portal_video (key) where edition_id is null;

alter table portal_video enable row level security;
revoke all on portal_video from anon, authenticated;

/**
 * Das Video zu einem Schlüssel — Edition zuerst, sonst die allgemeine Fassung.
 *
 * Zielgruppe wird geprüft: ein Partner-Video taucht im Speaker-Portal nicht
 * auf, auch wenn jemand den Schlüssel kennt.
 */
create or replace function portal_video_for(p_key text, p_audience text, p_edition_id uuid default null)
returns table (key text, title_de text, title_en text, url text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ed uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not (my_kb_audiences() && array[p_audience]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p_edition_id, (select e.id from event e where e.is_edition
                                  order by (current_date between e.start_date and e.end_date) desc,
                                           e.start_date desc limit 1))
    into v_ed;
  return query
    select v.key, v.title_de, v.title_en, v.url
      from portal_video v
     where v.key = p_key
       and v.audience && array[p_audience]
       and (v.edition_id = v_ed or v.edition_id is null)
     order by v.edition_id nulls last
     limit 1;
end $$;

/** Für die Admin-Liste: alle Videos, unabhängig von Zielgruppe und Edition. */
create or replace function portal_videos_admin()
returns table (id uuid, key text, title_de text, title_en text, url text,
               audience text[], edition_id uuid, edition_slug text, sort_order integer)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select v.id, v.key, v.title_de, v.title_en, v.url, v.audience, v.edition_id, e.slug, v.sort_order
      from portal_video v left join event e on e.id = v.edition_id
     order by v.sort_order, v.key;
end $$;

create or replace function upsert_portal_video(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_id uuid; v_url text; v_aud text[];
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  v_id := nullif(p_data->>'id', '')::uuid;
  v_url := btrim(coalesce(p_data->>'url', ''));
  -- Früh und mit eigenem Schlüssel abweisen: ein 23514 aus dem CHECK sagt der
  -- Redaktion nichts, „invalid_video_url" schon.
  if v_id is null or v_url <> '' then
    if not (v_url like 'https://www.loom.com/%' or v_url like 'https://loom.com/%') then
      raise exception 'invalid_video_url' using errcode = '22023', detail = coalesce(nullif(v_url, ''), 'leer');
    end if;
  end if;
  v_aud := coalesce((select array_agg(value::text) from jsonb_array_elements_text(p_data->'audience') as t(value)), '{}');

  if v_id is null then
    insert into portal_video (key, title_de, title_en, url, audience, edition_id, sort_order)
    values (btrim(p_data->>'key'), nullif(btrim(p_data->>'title_de'), ''), nullif(btrim(p_data->>'title_en'), ''),
            v_url, v_aud, nullif(p_data->>'edition_id', '')::uuid,
            coalesce((p_data->>'sort_order')::integer, 0))
    returning id into v_id;
  else
    update portal_video set
      key = coalesce(nullif(btrim(p_data->>'key'), ''), key),
      title_de = case when p_data ? 'title_de' then nullif(btrim(p_data->>'title_de'), '') else title_de end,
      title_en = case when p_data ? 'title_en' then nullif(btrim(p_data->>'title_en'), '') else title_en end,
      url = case when v_url <> '' then v_url else url end,
      audience = case when cardinality(v_aud) > 0 then v_aud else audience end,
      sort_order = coalesce((p_data->>'sort_order')::integer, sort_order),
      updated_at = now()
     where id = v_id;
    if not found then raise exception 'video_not_found' using errcode = 'P0002', detail = v_id::text; end if;
  end if;
  perform log_audit('portal_video.upsert', 'portal_video', v_id::text, null, p_data);
  return v_id;
end $$;

create or replace function delete_portal_video(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_staff() then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from portal_video where id = p_id;
  if not found then raise exception 'video_not_found' using errcode = 'P0002', detail = p_id::text; end if;
  perform log_audit('portal_video.delete', 'portal_video', p_id::text, null, null);
end $$;

select harden_definer_functions();
