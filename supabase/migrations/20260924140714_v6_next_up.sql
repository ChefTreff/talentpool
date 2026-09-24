-- 0165 · Welle 6 · Next Up im Teilnehmer-Portal (TAL-006): next_up_item, next_up_items, Pflege im Admin-Abschnitt nextUp
-- Angewendet von der Architektur-Session am 24.09.2026 als 20260924140714.
-- 00NN · „Next Up" im Teilnehmer-Portal (TAL-006): Hinweise auf kommende Events und Programme.
--
-- Anlass: Konrad 24.09.2026 (Eingang TAL-006) — „Home" bekommt eine Sektion **Next Up**:
-- Events und Programme wie das Bootcamp, **im Admin gepflegt** („ein super Marketing-Kanal").
-- D11 (Seitengruppe) ist entschieden; Home liegt seit TAL-005 auf `/start`.
--
-- Ein Eintrag ist ein **Hinweis**, kein Event: Titel, kurzer Text, ein Wort für die Karte
-- (z. B. „Bootcamp"), optional Datum und Link, Sichtbarkeitsfenster. Die Community-Events aus
-- Luma (TAL-007, D12) kommen über den Adapter, nicht über diese Tabelle.
--
-- Rechte:
--   * Lesen über `next_up_items()` — jede angemeldete Person, nur aktive Einträge im Fenster.
--     Die Tabelle selbst hat keine Grants für anon/authenticated.
--   * Pflegen über `next_up_items_admin()`, `upsert_next_up_item`, `delete_next_up_item` —
--     `can_edit_next_up()`: admin, marketing_team, area_lead_talent (Admin-Abschnitt
--     `nextUp`, dieselbe Rollenliste in `lib/admin-sections.ts`). Audit je Änderung.
--   * Links: `https://…` oder ein Portalpfad (`/…`, nicht `//`). Ein freies Feld, das auf der
--     Startseite jeder Person landet, darf kein `javascript:` tragen.
--
-- Fehlerschlüssel neu: 22023 `invalid_link_url`, P0002 `next_up_not_found`
-- (bestehend: 28000, 42501, 22023 `title_required`).
-- Test: supabase/tests/v6_next_up.sql
set search_path = public, extensions;

create table if not exists next_up_item (
  id            uuid primary key default gen_random_uuid(),
  word_de       text,
  word_en       text,
  title_de      text not null,
  title_en      text,
  teaser_de     text,
  teaser_en     text,
  link_url      text,
  starts_at     timestamptz,
  visible_from  timestamptz,
  visible_until timestamptz,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint next_up_title_chk check (btrim(title_de) <> ''),
  constraint next_up_link_chk check (
    link_url is null or link_url ~ '^https://[^\s]+$' or link_url ~ '^/[^/\\\s][^\s]*$' or link_url = '/'
  ),
  constraint next_up_window_chk check (
    visible_from is null or visible_until is null or visible_until > visible_from
  )
);
comment on table next_up_item is
  'Hinweise „Next Up" auf Home im Teilnehmer-Portal (TAL-006): Events und Programme, im Admin gepflegt. Keine Personendaten.';

drop trigger if exists trg_next_up_updated on next_up_item;
create trigger trg_next_up_updated before update on next_up_item
  for each row execute function set_updated_at();

alter table next_up_item enable row level security;
revoke all on next_up_item from anon, authenticated;
grant all on next_up_item to service_role;

create or replace function can_edit_next_up()
returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(has_role('admin') or has_role('marketing_team') or has_role('area_lead_talent'), false)
$$;

/** Für Home: aktive Einträge im Sichtbarkeitsfenster, nach Reihenfolge und Datum. */
create or replace function next_up_items()
returns table (id uuid, word_de text, word_en text, title_de text, title_en text,
               teaser_de text, teaser_en text, link_url text, starts_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  return query
    select n.id, n.word_de, n.word_en, n.title_de, n.title_en, n.teaser_de, n.teaser_en,
           n.link_url, n.starts_at
      from next_up_item n
     where n.active
       and (n.visible_from is null or n.visible_from <= now())
       and (n.visible_until is null or n.visible_until > now())
     order by n.sort_order, n.starts_at nulls last, n.created_at;
end $$;

/** Für den Admin: alle Einträge, auch inaktive und abgelaufene. */
create or replace function next_up_items_admin()
returns table (id uuid, word_de text, word_en text, title_de text, title_en text,
               teaser_de text, teaser_en text, link_url text, starts_at timestamptz,
               visible_from timestamptz, visible_until timestamptz, sort_order integer,
               active boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select n.id, n.word_de, n.word_en, n.title_de, n.title_en, n.teaser_de, n.teaser_en,
           n.link_url, n.starts_at, n.visible_from, n.visible_until, n.sort_order, n.active,
           n.updated_at
      from next_up_item n
     order by n.active desc, n.sort_order, n.starts_at nulls last, n.created_at;
end $$;

create or replace function upsert_next_up_item(p_data jsonb) returns uuid
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_id uuid := nullif(p_data->>'id', '')::uuid;
  v_title text := nullif(btrim(coalesce(p_data->>'title_de', '')), '');
  v_link text := nullif(btrim(coalesce(p_data->>'link_url', '')), '');
  v_before jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_title is null then raise exception 'title_required' using errcode = '22023'; end if;
  -- Früh und mit eigenem Schlüssel abweisen: ein 23514 sagt der Redaktion nichts.
  if v_link is not null and not (v_link ~ '^https://[^\s]+$' or v_link ~ '^/[^/\\\s][^\s]*$' or v_link = '/') then
    raise exception 'invalid_link_url' using errcode = '22023', detail = v_link;
  end if;

  if v_id is null then
    insert into next_up_item (word_de, word_en, title_de, title_en, teaser_de, teaser_en, link_url,
                              starts_at, visible_from, visible_until, sort_order, active)
    values (nullif(btrim(p_data->>'word_de'), ''), nullif(btrim(p_data->>'word_en'), ''),
            v_title, nullif(btrim(p_data->>'title_en'), ''),
            nullif(btrim(p_data->>'teaser_de'), ''), nullif(btrim(p_data->>'teaser_en'), ''),
            v_link,
            nullif(p_data->>'starts_at', '')::timestamptz,
            nullif(p_data->>'visible_from', '')::timestamptz,
            nullif(p_data->>'visible_until', '')::timestamptz,
            coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
            coalesce((p_data->>'active')::boolean, true))
    returning id into v_id;
  else
    select to_jsonb(n) into v_before from next_up_item n where n.id = v_id;
    if v_before is null then
      raise exception 'next_up_not_found' using errcode = 'P0002', detail = v_id::text;
    end if;
    update next_up_item set
      word_de = nullif(btrim(p_data->>'word_de'), ''),
      word_en = nullif(btrim(p_data->>'word_en'), ''),
      title_de = v_title,
      title_en = nullif(btrim(p_data->>'title_en'), ''),
      teaser_de = nullif(btrim(p_data->>'teaser_de'), ''),
      teaser_en = nullif(btrim(p_data->>'teaser_en'), ''),
      link_url = v_link,
      starts_at = nullif(p_data->>'starts_at', '')::timestamptz,
      visible_from = nullif(p_data->>'visible_from', '')::timestamptz,
      visible_until = nullif(p_data->>'visible_until', '')::timestamptz,
      sort_order = coalesce(nullif(p_data->>'sort_order', '')::integer, 0),
      active = coalesce((p_data->>'active')::boolean, active)
     where id = v_id;
  end if;
  perform log_audit('next_up.upsert', 'next_up_item', v_id::text, v_before, p_data);
  return v_id;
end $$;

create or replace function delete_next_up_item(p_id uuid) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_before jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not can_edit_next_up() then raise exception 'not allowed' using errcode = '42501'; end if;
  select to_jsonb(n) into v_before from next_up_item n where n.id = p_id;
  if v_before is null then
    raise exception 'next_up_not_found' using errcode = 'P0002', detail = coalesce(p_id::text, 'null');
  end if;
  delete from next_up_item where id = p_id;
  perform log_audit('next_up.delete', 'next_up_item', p_id::text, v_before, null);
end $$;

select harden_definer_functions();
